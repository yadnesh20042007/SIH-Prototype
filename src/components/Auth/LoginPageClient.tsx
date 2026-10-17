'use client';

import { useRef } from 'react';

import { DemoAccessPanel } from '@/components/Auth/DemoAccessPanel';
import { LoginForm, type LoginFormHandle } from '@/components/Auth/LoginForm';

export function LoginPageClient() {
  const handleRef = useRef<LoginFormHandle | null>(null);

  function handleFill(email: string, password: string) {
    handleRef.current?.fill(email, password);
  }

  return (
    <>
      <LoginForm onRegisterHandle={(h) => { handleRef.current = h; }} />
      <DemoAccessPanel onFill={handleFill} />
    </>
  );
}
