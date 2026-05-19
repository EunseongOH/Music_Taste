import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  
  const response = NextResponse.json({ 
    cleared: allCookies.length,
    message: '쿠키가 초기화되었습니다. 홈으로 이동합니다.'
  })

  // Delete all cookies
  for (const cookie of allCookies) {
    response.cookies.set(cookie.name, '', {
      maxAge: 0,
      path: '/',
    })
  }

  // Also clear common Supabase auth cookies explicitly
  const supabaseCookieNames = [
    'sb-access-token',
    'sb-refresh-token', 
    'supabase-auth-token',
    'worldcup_progress',
    'worldcup_tracks',
  ]
  for (const name of supabaseCookieNames) {
    response.cookies.set(name, '', { maxAge: 0, path: '/' })
  }

  return response
}
