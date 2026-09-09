import { sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { ServiceCategory } from '../../types';

export interface MatchedProvider {
  providerId: string;
  businessName: string;
  providerType: string;
  verificationLevel: string;
  rating: number;
  completedJobs: number;
  distanceMeters: number;
  distanceKm: number;
}

export class MatchingService {
  /**
   * Maps canonical MVP categories to required capabilities (OR semantics)
   */
  static getRequiredCapabilitiesForCategory(category: ServiceCategory): string[] {
    switch (category) {
      case 'electrical_starting':
        return ['AUTO_ELECTRIC', 'DIAGNOSTICS'];
      case 'battery_jumpstart':
        return ['BATTERY'];
      case 'mobile_mechanic':
        return ['MECHANICAL_MINOR'];
      default:
        return ['AUTO_ELECTRIC'];
    }
  }

  /**
   * Deterministic PostGIS matching:
   * 1. Provider is not blocked
   * 2. Provider is online
   * 3. Provider location is fresh (within 4 hours)
   * 4. Provider has 'MOBILE' service mode
   * 5. Provider has at least one active capability matching requiredCapabilities (OR semantics)
   * 6. Provider is within search radius (ST_DWithin)
   */
  static async findMatchingProviders(
    location: { lat: number; lng: number },
    requiredCapabilities: string[],
    radiusKm: number = 5
  ): Promise<MatchedProvider[]> {
    const radiusMeters = radiusKm * 1000;
    const pointWkt = `SRID=4326;POINT(${location.lng} ${location.lat})`;

    // Build SQL array for capabilities: ARRAY['CAP_1', 'CAP_2']
    const capSqlElements = requiredCapabilities.map((cap) => sql`${cap}`);
    const capArraySql = sql`ARRAY[${sql.join(capSqlElements, sql`, `)}]`;

    // PostgreSQL / PostGIS parameterized query
    const results = await db.execute<{
      provider_id: string;
      business_name: string;
      provider_type: string;
      verification_level: string;
      rating: number;
      completed_jobs: number;
      distance_meters: number;
    }>(sql`
      SELECT 
        p.id AS provider_id,
        p.business_name,
        p.provider_type,
        p.verification_level,
        p.rating,
        p.completed_jobs,
        ROUND(ST_Distance(pa.location, ST_GeogFromText(${pointWkt}))) AS distance_meters
      FROM providers p
      JOIN users u ON u.id = p.user_id
      JOIN provider_availability pa ON pa.provider_id = p.id
      JOIN provider_capabilities pc ON pc.provider_id = p.id
      JOIN provider_service_modes psm ON psm.provider_id = p.id
      WHERE u.is_blocked = FALSE
        AND pa.is_online = TRUE
        AND pa.location_updated_at >= NOW() - INTERVAL '4 hours'
        AND psm.service_mode = 'MOBILE'
        AND pc.is_active = TRUE
        AND pc.capability = ANY(${capArraySql})
        AND ST_DWithin(pa.location, ST_GeogFromText(${pointWkt}), ${radiusMeters})
      GROUP BY p.id, p.business_name, p.provider_type, p.verification_level, p.rating, p.completed_jobs, pa.location
      ORDER BY distance_meters ASC
    `);

    return (results as any[]).map((row) => ({
      providerId: row.provider_id,
      businessName: row.business_name,
      providerType: row.provider_type,
      verificationLevel: row.verification_level,
      rating: Number(row.rating) / 100,
      completedJobs: Number(row.completed_jobs),
      distanceMeters: Number(row.distance_meters),
      distanceKm: Math.round((Number(row.distance_meters) / 1000) * 10) / 10,
    }));
  }
}
