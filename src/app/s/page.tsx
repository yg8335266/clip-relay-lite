"use client";
import { Suspense } from 'react';
import ShareClient from './ShareClient';
import { useSearchParams } from 'next/navigation';

function SharePageInner() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  return <ShareClient token={token} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{padding:16}}>加载中...</div>}>
      <SharePageInner />
    </Suspense>
  );
}
