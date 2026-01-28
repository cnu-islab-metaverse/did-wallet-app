import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { authRouter } from './services/auth'
import { residentsRouter } from './services/residents'
import { issueRouter } from './services/issue'

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/residents', residentsRouter)
app.use('/api/issue', issueRouter)

// Static frontend
app.use('/', express.static(path.join(__dirname, 'static')))

const port = process.env.PORT || 20251
app.listen(port, () => {
  console.log(`Issuer (Resident ID) service running on http://localhost:${port}`)
})


