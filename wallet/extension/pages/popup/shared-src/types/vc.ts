export interface VerifiableCredential {
  id?: string;
  '@context': string[];
  type: string[];
  issuer: {
    id: string;
    name?: string;
  };
  credentialSubject: {
    id: string;
    [key: string]: any;
  };
  credentialStatus?: {
    id: string;
    type: string;
  };
  issuanceDate: string;
  expirationDate?: string;
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    jws: string;
  };
  // 확장프로그램에서 추가하는 메타데이터
  savedAt?: string;
  origin?: string;
}

export interface VCMetadata {
  id: string;
  title: string;
  issuer: string;
  subject: string;
  issuedDate: string;
  savedAt: string;
  origin: string;
}
