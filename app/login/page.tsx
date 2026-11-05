"use client";
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
export default function LoginPage() {
 const [error,setError]=useState('');const [pending,setPending]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();setError('');setPending(true);
  const form=new FormData(event.currentTarget);
  try {
   const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.get('username'),password:form.get('password')})});
   if(!response.ok){const data=await response.json();throw new Error(data.error ?? 'Sign in failed');}
   const from=new URLSearchParams(window.location.search).get('from');
   let target='/';
   if(from?.startsWith('/') && !from.startsWith('//') && !/[\\\s\u0000-\u001f]/.test(from) && !/%(?:2f|5c|0[ad])/i.test(from)) {
    const url=new URL(from,window.location.origin);
    if(url.origin===window.location.origin && !['/login','/setup'].includes(url.pathname))target=url.pathname+url.search+url.hash;
   }
   window.location.assign(target);
  }catch(reason){setError(reason instanceof Error?reason.message:'Sign in failed');}
  finally{setPending(false);}
 }
 return <main className="mx-auto max-w-md px-6 py-16 text-zinc-100">
  <h1 className="text-2xl font-semibold">Sign in</h1>
  <p className="mt-2 text-sm text-zinc-400">Use your installation account. Access is restricted to authorized users.</p>
  <form onSubmit={submit} className="mt-8 space-y-5">
   <div><label htmlFor="username" className="block text-sm">Username</label><input id="username" name="username" autoComplete="username" required minLength={3} maxLength={64} className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3" /></div>
   <div><label htmlFor="password" className="block text-sm">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3" /></div>
   {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
   <button disabled={pending} className="w-full rounded bg-zinc-100 p-3 text-zinc-950 disabled:opacity-50">{pending?'Signing in…':'Sign in'}</button>
  </form>
  <p className="mt-6 text-sm text-zinc-400">New installation? <Link href="/setup" className="underline">Set up administrator</Link>. A local operator token is required.</p>
 </main>;
}
