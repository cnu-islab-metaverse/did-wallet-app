import React from 'react';
import { VerifiableCredential } from '../types/vc';
import { getDemoVpRequest, buildVpFromRequestAndVc, type VerifiablePresentation } from '../lib/vpRequestHandler';

interface VCModalProps {
  vc: VerifiableCredential | null;
  onClose: () => void;
}

// Deprecated: kept for backward-compat import paths during refactor
export const VCModal: React.FC<VCModalProps> = ({ vc, onClose }) => null;
