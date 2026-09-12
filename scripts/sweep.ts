import { MaintenanceService } from '../src/server/services/maintenance.service';

async function main() {
  console.info('🧹 Running CarFix maintenance sweep...');
  const result = await MaintenanceService.runSweep();
  console.info('✅ Maintenance sweep completed successfully:', result);
}

main().catch((err) => {
  console.error('❌ Maintenance sweep failed:', err);
  process.exit(1);
});
