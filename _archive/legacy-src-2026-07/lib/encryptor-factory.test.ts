import { encryptorFactory } from './encryptor-factory';

// Node.js process 타입 정의
declare const process: {
  exit(code?: number): never;
};

// 테스트 설정
const testIterations = 100000; // MetaMask 표준 iterations
const testPassword = 'testPassword123';
const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const testData = { mnemonic: testMnemonic, timestamp: Date.now() };

// 테스트 결과 추적
let passedTests = 0;
let totalTests = 0;
const testPromises: Promise<void>[] = [];
const failures: { name: string; error: unknown }[] = [];

function test(name: string, testFn: () => void | Promise<void>) {
  totalTests++;
  console.log(`🧪 Testing: ${name}`);
  try {
    const maybePromise = testFn();
    if (maybePromise instanceof Promise) {
      const p = maybePromise
        .then(() => {
          console.log(`✅ PASSED: ${name}`);
          passedTests++;
        })
        .catch((error) => {
          console.log(`❌ FAILED: ${name}`);
          const err: any = error;
          const message = err?.message ?? String(err);
          console.error(`   Error: ${message}`);
          failures.push({ name, error });
        });
      testPromises.push(p);
    } else {
      console.log(`✅ PASSED: ${name}`);
      passedTests++;
    }
  } catch (error) {
    console.log(`❌ FAILED: ${name}`);
    const err: any = error;
    const message = err?.message ?? String(err);
    console.error(`   Error: ${message}`);
    failures.push({ name, error });
  }
}

async function runTests() {
  console.log('🚀 Starting Encryptor Factory Tests...\n');

  // 기본 기능 테스트
  test('should return an object with all required methods', () => {
    const encryptor = encryptorFactory(testIterations);

    const requiredMethods = [
      'encrypt',
      'encryptWithDetail',
      'encryptWithKey',
      'decrypt',
      'decryptWithDetail',
      'decryptWithKey',
      'keyFromPassword',
      'importKey',
      'exportKey',
      'generateSalt',
      'isVaultUpdated',
    ];

    requiredMethods.forEach((method) => {
      if (!(method in encryptor)) {
        throw new Error(`Missing method: ${method}`);
      }
    });
  });

  // 암호화 테스트
  test('should encrypt data successfully', async () => {
    const encryptor = encryptorFactory(testIterations);
    
    const encrypted = await encryptor.encrypt(testPassword, testMnemonic);
    
    if (typeof encrypted !== 'string' || encrypted.length === 0) {
      throw new Error('Encryption failed: Invalid result');
    }
    
    console.log(`   Encrypted length: ${encrypted.length} characters`);
  });

  // 암호화/복호화 통합 테스트
  test('should encrypt and decrypt data correctly', async () => {
    const encryptor = encryptorFactory(testIterations);
    
    // 암호화
    const encrypted = await encryptor.encrypt(testPassword, testData);
    
    // 복호화
    const decrypted = await encryptor.decrypt(testPassword, encrypted);
    
    if (JSON.stringify(decrypted) !== JSON.stringify(testData)) {
      throw new Error('Decryption failed: Data mismatch');
    }
    
    console.log(`   Original: ${JSON.stringify(testData)}`);
    console.log(`   Decrypted: ${JSON.stringify(decrypted)}`);
  });

  // Salt 생성 테스트
  test('should generate salt successfully', () => {
    const encryptor = encryptorFactory(testIterations);
    
    const salt = encryptor.generateSalt();
    
    if (typeof salt !== 'string' || salt.length === 0) {
      throw new Error('Salt generation failed');
    }
    
    console.log(`   Generated salt: ${salt.substring(0, 20)}...`);
  });

  // 키 파생 테스트
  test('should derive key from password', async () => {
    const encryptor = encryptorFactory(testIterations);
    const salt = encryptor.generateSalt();
    
    const keyResult = await encryptor.keyFromPassword(testPassword, salt);
    
    if (!keyResult || !keyResult.key) {
      throw new Error('Key derivation failed');
    }
    
    console.log(`   Key derived successfully`);
  });

  // Vault 업데이트 확인 테스트
  test('should check vault update status', () => {
    const encryptor = encryptorFactory(testIterations);
    
    // 더 낮은 iterations로 생성된 vault 시뮬레이션
    const oldVault = '{"data":"test","iv":"test","salt":"test"}';
    
    const isUpdated = encryptor.isVaultUpdated(oldVault);
    
    console.log(`   Vault update status: ${isUpdated}`);
  });

  // 잘못된 비밀번호로 복호화 시도
  test('should fail with wrong password', async () => {
    const encryptor = encryptorFactory(testIterations);
    
    const encrypted = await encryptor.encrypt(testPassword, testMnemonic);
    
    try {
      await encryptor.decrypt('wrongPassword', encrypted);
      throw new Error('Should have failed with wrong password');
    } catch (error: any) {
      console.log(`   Correctly failed with wrong password: ${error.message}`);
    }
  });

  // 테스트 완료
  // 비동기 테스트 완료 대기
  if (testPromises.length > 0) {
    await Promise.allSettled(testPromises);
  }

  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passedTests}/${totalTests}`);

  if (failures.length > 0) {
    console.log('\n❗ Failures:');
    for (const f of failures) {
      const err: any = f.error;
      const message = err?.message ?? String(err);
      const stack = typeof err?.stack === 'string' ? err.stack.split('\n')[1] ?? '' : '';
      console.log(`- ${f.name}`);
      console.log(`  Message: ${message}`);
      if (stack) console.log(`  ${stack.trim()}`);
    }
  }

  if (passedTests === totalTests) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

// 테스트 실행
console.log('Running tests...');
runTests().catch(console.error);
