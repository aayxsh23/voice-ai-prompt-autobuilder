import React from 'react';
import { Button, Input, Card } from '@/components/ui';

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <h2 className="text-[24px] font-semibold tracking-tight text-ink">
            Welcome back
          </h2>
          <p className="mt-2 text-[14px] text-graphite">
            Sign in to continue to VoiceAgent Studio
          </p>
        </div>

        <Card className="p-6 sm:p-8">
          <form className="space-y-4" action="/dashboard" method="GET">
            <div className="space-y-1">
              <label htmlFor="username" className="block text-[13px] font-medium text-ink">
                Username
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Enter your username"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="block text-[13px] font-medium text-ink">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" variant="primary" className="w-full justify-center">
              Sign In
            </Button>
          </form>

          <div className="mt-6 relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center text-[12px]">
              <span className="bg-surface px-2 text-faint">Or continue with</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="secondary" className="w-full justify-center text-[13px] font-normal" type="button">
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.25024 6.65L5.27028 9.765C6.21525 6.81 8.91533 4.75 12.0003 4.75Z"
                  fill="#EA4335"
                />
                <path
                  d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L20.03 21.15C22.35 19.01 23.49 15.92 23.49 12.275Z"
                  fill="#4285F4"
                />
                <path
                  d="M5.26498 14.2349C5.02498 13.5099 4.88501 12.7599 4.88501 11.9999C4.88501 11.2399 5.01998 10.4899 5.26498 9.76495L1.23999 6.64996C0.439987 8.25996 0 10.0749 0 11.9999C0 13.9249 0.440015 15.7399 1.24001 17.3499L5.26498 14.2349Z"
                  fill="#FBBC05"
                />
                <path
                  d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.91541 19.245 6.21537 17.185 5.2654 14.24L1.24036 17.355C3.25539 21.315 7.3104 24.0001 12.0004 24.0001Z"
                  fill="#34A853"
                />
              </svg>
              Google
            </Button>
            <Button variant="secondary" className="w-full justify-center text-[13px] font-normal" type="button">
              <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              GitHub
            </Button>
          </div>
        </Card>
        
        <p className="mt-8 text-center text-[13px] text-graphite">
          By continuing, you agree to our{' '}
          <a href="#" className="link">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="link">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
