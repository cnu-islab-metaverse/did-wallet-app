import type { VerifiableCredential } from '../types/vc';

export interface Oid4vpRequestLike {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  nonce?: string;
  presentation_definition?: unknown;
  claims?: unknown;
}

export interface VerifiablePresentation {
  '@context': string[];
  type: string[];
  verifiableCredential: unknown[];
  holder?: string;
  proof?: unknown;
}

export function getDemoVpRequest(): Oid4vpRequestLike {
  return {
    response_type: 'vp_token',
    client_id: 'https://metaverse.example.com/verifier',
    redirect_uri: 'https://metaverse.example.com/callback',
    scope: 'openid',
    state: 'demo-state-123',
    nonce: 'demo-nonce-123',
    presentation_definition: {
      id: 'pd-demo',
      input_descriptors: [
        {
          id: 'university-degree',
          constraints: { fields: [{ path: ['$.credentialSubject.degree.type'], filter: { const: 'BachelorDegree' } }] }
        }
      ]
    },
    claims: {
      query: [{ type: 'DCQLQuery', credentialQuery: [{ reason: 'Demo', acceptedFormats: ['jwt_vc'] }]}]
    }
  };
}

export function buildVpFromRequestAndVc(req: Oid4vpRequestLike, vc: VerifiableCredential): VerifiablePresentation {
  const holderDid = vc.credentialSubject?.id || 'did:example:holder-unknown';
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1'
    ],
    type: ['VerifiablePresentation'],
    verifiableCredential: [vc],
    holder: holderDid,
    proof: {
      type: 'JwtProof2020',
      created: new Date().toISOString(),
      proofPurpose: 'authentication',
      challenge: req?.nonce || 'demo-nonce',
      domain: req?.client_id || 'https://metaverse.example.com/verifier',
      jwt: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.DEMO.PRESENTATION'
    }
  };
}


