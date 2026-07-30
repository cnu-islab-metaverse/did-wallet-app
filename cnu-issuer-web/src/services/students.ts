import { Router, Request, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'

// Load student database
const dbPath = path.join(__dirname, '../database/students.json')
const dbContent = fs.readFileSync(dbPath, 'utf-8')
const db = JSON.parse(dbContent)

interface Student {
  studentId: string
  name: string
  sex: string // '남' | '여'
  birth: string
  department: string
  college: string
  degree: string
  admissionYear: number
  graduationYear: number | null
  status: string // '재학' | '졸업'
  nationalId: string
  email: string
}

export const studentsRouter = Router()

// Verify student with studentId and birth date
studentsRouter.post('/verify', (req: Request, res: Response) => {
  const { studentId, birth } = req.body || {}
  if (!studentId || !birth) {
    return res.status(400).json({ error: 'studentId and birth are required' })
  }

  const student: Student = db.students.find((s: Student) => s.studentId === studentId && s.birth === birth)
  if (!student) {
    return res.status(404).json({ error: 'Student not found or birth date mismatch' })
  }

  res.json({
    ok: true,
    student: {
      ...student,
      profileImage: (student.sex === '남' || student.sex === 'male') ? '/assets/profile-male.svg' : '/assets/profile-female.svg'
    }
  })
})

// Admin lookup (mock)
studentsRouter.get('/:studentId', (req: Request, res: Response) => {
  const student: Student = db.students.find((s: Student) => s.studentId === req.params.studentId)
  if (!student) return res.status(404).json({ error: 'Student not found' })
  res.json({ student })
})


