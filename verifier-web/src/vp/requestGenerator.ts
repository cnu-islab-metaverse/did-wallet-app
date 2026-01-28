import { randomUUID } from 'crypto';

/**
 * Build a minimal OID4VP-compatible Authorization Request (JAR-less) with
 * Presentation Exchange and a DCQL-like credentialQuery for residency proof.
 */
export function createResidencyVpRequest(regionName: string) {
  const state = randomUUID();
  const nonce = randomUUID();

  // Require a VC proving identity with a residential address field
  const presentationDefinition = {
    id: `pd-${state}`,
    format: {
      "jwt_vc": { alg: ["ES256", "ES256K", "EdDSA"] },
      "jwt_vp": { alg: ["ES256", "ES256K", "EdDSA"] }
    },
    input_descriptors: [
      {
        id: "residency",
        name: "Residency Credential",
        purpose: `Prove you reside in ${regionName} using a government-issued credential`,
        constraints: {
          fields: [
            {
              path: [
                "$.credentialSubject.residentialAddress",
                "$.vc.credentialSubject.residentialAddress"
              ],
              filter: { type: "string" }
            }
          ]
        }
      }
    ]
  };

  const dcqlQuery = {
    query: [
      {
        type: "DCQLQuery",
        credentialQuery: [
          {
            reason: `Eligibility check for ${regionName} SBT`,
            acceptedFormats: ["jwt_vc", "ldp_vc"],
            filter: {
              type: ["VerifiableCredential"],
              credentialSubject: {
                residentialAddress: { type: "string" }
              }
            }
          }
        ]
      }
    ]
  };

  const authorizationRequest = {
    response_type: "vp_token",
    client_id: "https://verifier.example.kr/region",
    redirect_uri: "https://verifier.example.kr/callback",
    scope: "openid",
    state,
    nonce,
    presentation_definition: presentationDefinition,
    claims: dcqlQuery
  };

  return authorizationRequest;
}


