import React from 'react';
import { VerifiableCredential } from '../types/vc';

interface VCModalProps {
  vc: VerifiableCredential | null;
  onClose: () => void;
}

// Deprecated: kept for backward-compat import paths during refactor
export const VCModal: React.FC<VCModalProps> = () => null;
