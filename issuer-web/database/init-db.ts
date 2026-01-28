import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'

const dbPath = path.join(__dirname, 'residents.db')

// 기존 DB 삭제 (재생성을 위해)
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath)
  console.log('🗑️  기존 데이터베이스 삭제됨')
}

const db = new Database(dbPath)

// Create residents table based on example.json structure
db.exec(`
  CREATE TABLE IF NOT EXISTS residents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    txid TEXT NOT NULL,
    cxid TEXT NOT NULL,
    name TEXT NOT NULL,
    ihidnum TEXT NOT NULL,
    address TEXT NOT NULL,
    birth TEXT NOT NULL,
    title TEXT NOT NULL,
    issude TEXT NOT NULL,
    issuernm TEXT NOT NULL,
    foreignflag TEXT NOT NULL DEFAULT 'N',
    dlphotoimage TEXT,
    converterimage TEXT,
    provider TEXT NOT NULL,
    resultCode TEXT NOT NULL DEFAULT '200',
    clientMessage TEXT NOT NULL DEFAULT '성공',
    signType TEXT NOT NULL,
    sex TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// 올바른 주민등록번호 생성 함수
function generateValidRRN(birthDate: string, gender: string): string {
  const [year, month, day] = birthDate.split('-')
  const yy = year.substring(2, 4)
  const mm = month
  const dd = day
  
  let genderCode: number
  const fullYear = parseInt(year)
  
  if (fullYear >= 1900 && fullYear <= 1999) {
    genderCode = gender === 'male' ? 1 : 2
  } else if (fullYear >= 2000 && fullYear <= 2099) {
    genderCode = gender === 'male' ? 3 : 4
  } else {
    genderCode = gender === 'male' ? 9 : 0
  }
  
  // 일련번호는 5자리 (뒷자리 7자리 중 성별코드 1자리 + 지역/일련번호 5자리 + 체크섬 1자리)
  const serial = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
  const rrnWithoutCheck = `${yy}${mm}${dd}${genderCode}${serial}`
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
  let sum = 0
  
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(rrnWithoutCheck[i], 10)
    sum += digit * weights[i]
  }
  
  const checksumCalc = 11 - (sum % 11)
  const checksum = checksumCalc % 10
  const result = `${yy}${mm}${dd}-${genderCode}${serial}${checksum}`
  return result
}

function generateTxid(): string {
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function generateCxid(): string {
  const part1 = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const part2 = Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const part3 = Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${part1}-${part2}-${part3}`
}

// Insert sample data
const insertStmt = db.prepare(`
  INSERT INTO residents (
    txid, cxid, name, ihidnum, address, birth, title, issude, issuernm, 
    foreignflag, provider, resultCode, clientMessage, signType, sex
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const residentsData = [
  { name: '홍길동', birth: '1960-05-02', gender: 'male', address: '서울시 강남구', issuer: '서울특별시 강남구청장' },
  { name: '김철수', birth: '1962-04-20', gender: 'female', address: '서울시 서초구', issuer: '서울특별시 서초구청장' },
  { name: '이영희', birth: '1964-03-26', gender: 'male', address: '서울시 송파구', issuer: '서울특별시 송파구청장' },
  { name: '박민수', birth: '1966-04-24', gender: 'female', address: '부산시 해운대구', issuer: '부산광역시 해운대구청장' },
  { name: '최수지', birth: '1968-07-09', gender: 'male', address: '경기도 수원시', issuer: '경기도 수원시청장' },
  { name: '정다연', birth: '1970-06-23', gender: 'female', address: '대구시 남구', issuer: '대구광역시 남구청장' },
  { name: '오하나', birth: '1972-09-06', gender: 'male', address: '인천시 남동구', issuer: '인천광역시 남동구청장' },
  { name: '장우진', birth: '1974-01-10', gender: 'female', address: '광주시 북구', issuer: '광주광역시 북구청장' },
  { name: '서지훈', birth: '1976-04-09', gender: 'male', address: '울산시 남구', issuer: '울산광역시 남구청장' },
  { name: '한소라', birth: '1978-11-06', gender: 'female', address: '강원도 춘천시', issuer: '강원도 춘천시청장' },
  { name: '권지민', birth: '1980-08-21', gender: 'male', address: '충남 천안시', issuer: '충청남도 천안시청장' },
  { name: '윤수빈', birth: '1982-02-13', gender: 'female', address: '충북 청주시', issuer: '충청북도 청주시청장' },
  { name: '배다희', birth: '1984-09-05', gender: 'male', address: '전북 전주시', issuer: '전라북도 전주시청장' },
  { name: '신유진', birth: '1986-11-14', gender: 'female', address: '전남 순천시', issuer: '전라남도 순천시청장' },
  { name: '문채원', birth: '1988-12-05', gender: 'male', address: '경남 창원시', issuer: '경상남도 창원시청장' },
  { name: '유지은', birth: '1990-10-03', gender: 'female', address: '경북 포항시', issuer: '경상북도 포항시청장' },
  { name: '전지민', birth: '1992-04-24', gender: 'male', address: '서울시 강남구', issuer: '서울특별시 강남구청장' },
  { name: '임지후', birth: '1994-04-19', gender: 'female', address: '서울시 서초구', issuer: '서울특별시 서초구청장' },
  { name: '송하영', birth: '1996-08-03', gender: 'male', address: '서울시 송파구', issuer: '서울특별시 송파구청장' },
  { name: '진예린', birth: '1998-07-22', gender: 'female', address: '부산시 해운대구', issuer: '부산광역시 해운대구청장' },
  { name: '황예진', birth: '2000-11-17', gender: 'male', address: '경기도 수원시', issuer: '경기도 수원시청장' },
  { name: '조민성', birth: '2002-01-12', gender: 'female', address: '대구시 남구', issuer: '대구광역시 남구청장' },
  { name: '송한결', birth: '2004-03-15', gender: 'male', address: '인천시 남동구', issuer: '인천광역시 남동구청장' },
  { name: '백승민', birth: '2006-05-18', gender: 'female', address: '광주시 북구', issuer: '광주광역시 북구청장' },
  { name: '차은우', birth: '2008-07-21', gender: 'male', address: '울산시 남구', issuer: '울산광역시 남구청장' },
  { name: '남지성', birth: '2010-10-10', gender: 'female', address: '강원도 춘천시', issuer: '강원도 춘천시청장' },
  { name: '김준서', birth: '2012-03-12', gender: 'male', address: '충남 천안시', issuer: '충청남도 천안시청장' },
  { name: '이지안', birth: '2014-05-14', gender: 'female', address: '충북 청주시', issuer: '충청북도 청주시청장' },
  { name: '장현우', birth: '2016-07-16', gender: 'male', address: '전북 전주시', issuer: '전라북도 전주시청장' },
  { name: '하승우', birth: '2018-09-18', gender: 'female', address: '전남 순천시', issuer: '전라남도 순천시청장' },
  { name: '홍길동', birth: '1990-05-02', gender: 'male', address: '대전시 유성구', issuer: '대전광역시 유성구청장' },
  { name: '이대전', birth: '1975-03-11', gender: 'male', address: '대전시 서구', issuer: '대전광역시 서구청장' },
  { name: '박지현', birth: '1983-09-27', gender: 'female', address: '대전시 유성구', issuer: '대전광역시 유성구청장' },
  { name: '정민호', birth: '1995-12-02', gender: 'male', address: '대전시 동구', issuer: '대전광역시 동구청장' },
  { name: '최은지', birth: '2001-06-15', gender: 'female', address: '대전시 중구', issuer: '대전광역시 중구청장' },
  { name: '김성훈', birth: '2010-08-23', gender: 'male', address: '대전시 대덕구', issuer: '대전광역시 대덕구청장' },
  { name: '이영민', birth: '2018-11-28', gender: 'female', address: '대전시 서구', issuer: '대전광역시 서구청장' }
]

const sampleData = residentsData.map(person => ({
  txid: generateTxid(),
  cxid: generateCxid(),
  name: person.name,
  ihidnum: generateValidRRN(person.birth, person.gender),
  address: person.address,
  birth: person.birth.replace(/-/g, ''),
  title: '주민등록증',
  issude: '2020.01.01',
  issuernm: person.issuer,
  foreignflag: 'N',
  provider: 'comrc',
  resultCode: '200',
  clientMessage: '성공',
  signType: 'ENT_MID',
  sex: person.gender
}))

console.log('📝 30명의 유효한 주민등록번호 데이터 생성 중...\n')

for (const data of sampleData) {
  insertStmt.run(
    data.txid, data.cxid, data.name, data.ihidnum, data.address, data.birth,
    data.title, data.issude, data.issuernm, data.foreignflag, data.provider,
    data.resultCode, data.clientMessage, data.signType, data.sex
  )
  console.log(`✅ ${data.name} - RRN: ${data.ihidnum}`)
}

console.log(`\n✅ 총 ${sampleData.length}명의 데이터 삽입 완료`)

db.close()
console.log('✅ 데이터베이스 초기화 성공')

