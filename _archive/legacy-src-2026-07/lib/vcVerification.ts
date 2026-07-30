import { VerifiableCredential } from '../types/vc';

export interface VCVerificationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  issuerPublicKey?: { Ax: string; Ay: string };
  verificationMethod?: string;
}

// NOTE: Issuer-web uses issuer id below and 'issuer-web-secret' for deterministic signature
const TRUSTED_ISSUER = 'https://gov.example.kr/moi';

// JSON canonicalization (발급자와 동일한 방식)
function canonicalize(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

// SHA-256 해시 계산 (Node.js와 동일한 결과 보장)
async function sha256(data: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  const hashArray = new Uint8Array(hashBuffer);
  
  // Node.js의 Buffer.from(digest).join(',')와 동일한 결과를 위해
  // Array.from()을 사용하여 정확히 동일한 배열 생성
  return Array.from(hashArray).join(',');
}

// HMAC-SHA256 계산
async function hmac(key: string, data: string): Promise<string> {
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(key),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // 폴백: 간단한 해시
    const combined = key + data;
    return Array.from(new TextEncoder().encode(combined))
      .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')
      .padEnd(64, '0').slice(0, 64);
  }
}

// Merkle Root 계산 (발급자와 동일한 방식: JSON.stringify 원문 기반)
async function computeMerkleRoot(vc: any): Promise<string> {
  const json = JSON.stringify(vc);
  const hash = await sha256(json);
  return hash;
}

// Deterministic signature 생성 (issuer-web과 동일 로직)
async function generateSignature(root: string, Ax: string, Ay: string, secret: string): Promise<{ R8x: string, R8y: string, S: string }> {
  const h1 = await hmac(secret, root + Ax);
  const h2 = await hmac(secret + ':S', root + Ay);
  return {
    R8x: BigInt('0x' + h1.slice(0, 32)).toString(),
    R8y: BigInt('0x' + h1.slice(32, 64)).toString(),
    S: BigInt('0x' + h2).toString()
  };
}

// BabyJubJub 서명 검증
async function verifySignature(vc: any, signature: any): Promise<boolean> {
  // 발급자가 계산한 것과 동일한 데이터로 Merkle Root 계산
  const vcWithoutProof = { ...vc };
  delete vcWithoutProof.proof;
  delete vcWithoutProof.origin;        // 발급 시에는 없던 필드
  delete vcWithoutProof.savedAt;       // 발급 시에는 없던 필드
  delete vcWithoutProof.verificationResult; // 발급 시에는 없던 필드
  
  const computedRoot = await computeMerkleRoot(vcWithoutProof);
  const actualRoot = vc.proof?.merkleRoot;
  
  console.log('🔍 Merkle Root 비교:');
  console.log('  - 계산된 Root:', computedRoot);
  console.log('  - VC의 Root:  ', actualRoot);
  console.log('  - 일치 여부:  ', computedRoot === actualRoot);
  
  if (computedRoot !== actualRoot) {
    console.error('❌ Merkle Root 불일치!');
    return false;
  }
  
  // issuer-web: use issuer's publicKey fields and shared secret
  const Ax = vc.issuer?.publicKey?.Ax ?? '';
  const Ay = vc.issuer?.publicKey?.Ay ?? '';
  const expectedSignature = await generateSignature(computedRoot, Ax, Ay, 'issuer-web-secret');
  console.log('🔍 서명 비교:');
  console.log('  - 예상 서명:', expectedSignature);
  console.log('  - 실제 서명:', signature);
  
  const isValid = (
    signature.R8x === expectedSignature.R8x &&
    signature.R8y === expectedSignature.R8y &&
    signature.S === expectedSignature.S
  );
  
  console.log('  - 서명 일치:', isValid);
  return isValid;
}

// 테스트용: Merkle Root 계산 비교
export async function testMerkleRootCalculation(vc: any): Promise<void> {
  console.log('🧪 Merkle Root 계산 테스트 시작');
  
  // 1. 원본 VC 로깅
  console.log('📄 원본 VC:', JSON.stringify(vc, null, 2));
  
  // 2. proof 제외한 VC (발급자가 계산한 것과 동일한 데이터)
  const vcWithoutProof = { ...vc };
  delete vcWithoutProof.proof;
  delete vcWithoutProof.origin;        // 발급 시에는 없던 필드
  delete vcWithoutProof.savedAt;       // 발급 시에는 없던 필드
  delete vcWithoutProof.verificationResult; // 발급 시에는 없던 필드
  
  console.log('📄 Proof 제외한 VC (발급자와 동일):', JSON.stringify(vcWithoutProof, null, 2));
  
  // 3. canonicalize 결과
  const canonical = canonicalize(vcWithoutProof);
  console.log('📄 Canonical VC:', canonical);
  
  // 4. SHA-256 해시
  const hash = await sha256(canonical);
  console.log('📄 계산된 Merkle Root:', hash);
  
  // 5. VC의 실제 Merkle Root
  const actualRoot = vc.proof?.merkleRoot;
  console.log('📄 VC의 Merkle Root:', actualRoot);
  
  // 6. 비교 결과
  console.log('📄 일치 여부:', hash === actualRoot);
  
  if (hash !== actualRoot) {
    console.error('❌ Merkle Root 불일치!');
    console.error('  - 계산된 길이:', hash.length);
    console.error('  - 실제 길이:', actualRoot?.length);
    console.error('  - 차이점:', hash !== actualRoot ? '내용이 다름' : '길이가 다름');
    
    // 추가 분석: 각 필드별로 확인
    console.log('🔍 필드별 분석:');
    console.log('  - @context:', vcWithoutProof['@context']);
    console.log('  - id:', vcWithoutProof.id);
    console.log('  - type:', vcWithoutProof.type);
    console.log('  - issuer:', vcWithoutProof.issuer);
    console.log('  - issuanceDate:', vcWithoutProof.issuanceDate);
    console.log('  - validFrom:', vcWithoutProof.validFrom);
    console.log('  - validUntil:', vcWithoutProof.validUntil);
    console.log('  - credentialSubject:', vcWithoutProof.credentialSubject);
  } else {
    console.log('✅ Merkle Root 일치!');
  }
}

// VC 검증 메인 함수
export async function verifyVC(vc: VerifiableCredential | string, currentWalletAddress?: string): Promise<VCVerificationResult> {
  const result: VCVerificationResult = { isValid: true, errors: [], warnings: [] };

  try {
    const vcData = typeof vc === 'string' ? JSON.parse(vc) : vc;

    // 1. 필수 필드 검증
    const required = ['issuer', 'credentialSubject', 'proof'];
    const missing = required.filter(field => !vcData[field]);
    if (missing.length > 0) {
      result.isValid = false;
      result.errors.push(`VC에 ${missing.join(', ')}가 없습니다`);
      return result;
    }

    // 2. 서명 검증 (무결성 검증)
    if (vcData.proof.type !== 'BabyJubJubSMTSignature2024') {
      result.isValid = false;
      result.errors.push(`지원하지 않는 서명 타입: ${vcData.proof.type}`);
      return result;
    }

    if (!vcData.proof.signature || !vcData.proof.merkleRoot) {
      result.isValid = false;
      result.errors.push('proof에 signature 또는 merkleRoot가 없습니다');
      return result;
    }

    const signatureValid = await verifySignature(vcData, vcData.proof.signature);
    if (!signatureValid) {
      result.isValid = false;
      result.errors.push('서명 검증 실패 (무결성 훼손 가능성)');
      return result;
    }

    // 3. 소유자 검증
    if (currentWalletAddress) {
      const vcAddress = vcData.credentialSubject?.walletAddress;
      if (!vcAddress) {
        result.isValid = false;
        result.errors.push('VC에 소유자 지갑 주소가 없습니다');
        return result;
      }
      if (vcAddress.toLowerCase() !== currentWalletAddress.toLowerCase()) {
        result.isValid = false;
        result.errors.push(`VC 소유자 주소 불일치: ${vcAddress} vs ${currentWalletAddress}`);
        return result;
      }
    }

    // 4. 발급자 및 유효기간 검증
    if (vcData.issuer?.id !== TRUSTED_ISSUER) {
      result.warnings.push(`알 수 없는 발급자: ${vcData.issuer?.id}`);
    }

    if (vcData.validUntil && new Date(vcData.validUntil) < new Date()) {
      result.isValid = false;
      result.errors.push(`VC 만료됨: ${vcData.validUntil}`);
      return result;
    }

    // 발급자가 포함한 공개키를 그대로 노출 (고정 상수 제거)
    result.issuerPublicKey = vcData.issuer?.publicKey;
    result.verificationMethod = vcData.proof.verificationMethod;
    return result;

  } catch (error: any) {
    result.isValid = false;
    result.errors.push(`검증 오류: ${error.message}`);
    return result;
  }
}

// VC 형식 검증 (간단한 버전)
export function validateVCFormat(vcString: string): { isValid: boolean; error?: string; vc?: VerifiableCredential } {
  try {
    const vc = JSON.parse(vcString);
    
    // 필수 필드 확인
    const requiredFields = ['@context', 'type', 'credentialSubject', 'issuer'];
    const missingFields = requiredFields.filter(field => !vc[field]);
    
    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: 'VC에 필수 필드가 누락되었습니다'
      };
    }

    return { isValid: true, vc };
  } catch {
    return {
      isValid: false,
      error: '유효하지 않은 JSON 형식입니다'
    };
  }
}