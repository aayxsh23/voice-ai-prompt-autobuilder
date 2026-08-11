import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default function proxy(req: NextRequest) {
  const basicAuth = req.headers.get('authorization')
  
  const username = process.env.TESTING_USERNAME
  const password = process.env.TESTING_PASSWORD

  if (username && password) {
    if (basicAuth) {
      const authValue = basicAuth.split(' ')[1]
      try {
        const [user, pwd] = atob(authValue).split(':')
        if (user === username && pwd === password) {
          return NextResponse.next()
        }
      } catch (e) {
        // Handle decoding errors silently
      }
    }

    return new NextResponse('Auth required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Secure Area"',
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
