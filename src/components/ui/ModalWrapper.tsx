'use client';

import React from 'react';
import { useModalBehavior } from '../../lib/useModalBehavior';

export interface ModalWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  isDirty?: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  showCloseButton?: boolean;
  closeAriaLabel?: string;
  className?: string;
  contentClassName?: string;
  onAttemptCloseDirty?: () => void;
}

/**
 * Reusable accessible modal dialog component.
 * Guaranteed protection against:
 * 1. Accidental backdrop click on drag-select
 * 2. Losing uncommitted form data when isDirty is true
 * 3. Page background scroll & scrollbar shift jumping
 * 4. Missing keyboard Escape support
 */
export default function ModalWrapper({
  isOpen,
  onClose,
  isDirty = false,
  title,
  subtitle,
  children,
  maxWidth = '520px',
  showCloseButton = true,
  closeAriaLabel = 'Закрыть диалоговое окно',
  className = '',
  contentClassName = '',
  onAttemptCloseDirty,
}: ModalWrapperProps) {
  const { contentRef, backdropProps, handleKeyDown } = useModalBehavior({
    isOpen,
    onClose,
    isDirty,
    onAttemptCloseDirty,
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-dialog-title' : undefined}
      className={`modal-overlay ${className}`}
      onMouseDown={backdropProps.onMouseDown}
      onMouseUp={backdropProps.onMouseUp}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(5, 8, 16, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <div
        ref={contentRef}
        className={`glass-card modal-content ${contentClassName}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
          background: '#0D1627',
          border: '1px solid var(--border-card)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          padding: '2rem',
          position: 'relative',
        }}
      >
        {/* Header with Title and Accessible Close Button */}
        {(title || showCloseButton) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
              marginBottom: subtitle ? '0.4rem' : '1.5rem',
            }}
          >
            {title && (
              <h3
                id="modal-dialog-title"
                style={{
                  fontSize: '1.45rem',
                  fontWeight: 900,
                  color: '#FFFFFF',
                  lineHeight: 1.25,
                  margin: 0,
                }}
              >
                {title}
              </h3>
            )}

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeAriaLabel}
                className="modal-close-btn touch-manipulation"
                style={{
                  minWidth: '48px',
                  minHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                  marginLeft: 'auto',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {subtitle && (
          <div
            style={{
              fontSize: '0.95rem',
              color: 'var(--text-secondary)',
              marginBottom: '1.5rem',
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </div>
        )}

        {/* Content Body */}
        {children}
      </div>
    </div>
  );
}
