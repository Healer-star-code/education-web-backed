import { loadLocalEnv } from './env.ts'

loadLocalEnv(process.env.V3_WEB_SECRET_ENV ?? 'C:\\Users\\lenov\\AppData\\Local\\Temp\\opencode\\v3-web.deepseek.env')
loadLocalEnv()
