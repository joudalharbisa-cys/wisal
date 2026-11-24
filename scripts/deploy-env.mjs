// Blocks a deploy whose production build would use emulator/demo settings.
// Runs automatically before `npm run deploy` (predeploy).
const REQUIRED = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']

export function deployEnvProblems(env) {
  const problems = []
  const missing = REQUIRED.filter(k => !env[k]?.trim())
  if (missing.length) problems.push(`missing: ${missing.join(', ')}`)
  if (env.VITE_USE_EMULATORS === 'true') problems.push('VITE_USE_EMULATORS=true')
  const id = env.VITE_FIREBASE_PROJECT_ID ?? ''
  if (id.startsWith('demo-')) problems.push(`demo project id: ${id}`)
  return problems
}

if (process.argv[1]?.endsWith("deploy-env.mjs")) {
  const { loadEnv } = await import('vite')
  const problems = deployEnvProblems(loadEnv('production', process.cwd(), 'VITE_'))
  if (problems.length) {
    console.error('النشر موقوف: إعدادات الإنتاج غير صالحة')
    for (const p of problems) console.error(' - ' + p)
    console.error('حط إعدادات مشروع Firebase الحقيقي في .env.production.local')
    process.exit(1)
  }
  console.log('إعدادات الإنتاج سليمة')
}
