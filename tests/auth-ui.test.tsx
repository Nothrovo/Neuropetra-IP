import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from '../app/login/page';
import SetupPage from '../app/setup/page';
describe('account forms without shipped credentials',()=>{
 it('has accessible login fields and no demo credential/quick-fill flow',()=>{
  const html=renderToStaticMarkup(<LoginPage/>);
  expect(html).toContain('Sign in');expect(html).toContain('autoComplete="current-password"');
  expect(html).not.toMatch(/soc123|Demo Creds|Quick.Fill/);
  expect(html).toContain('for="username"');
 });
 it('requires the operator token and a confirmed strong first password',()=>{
  const html=renderToStaticMarkup(<SetupPage/>);
  expect(html).toContain('Bootstrap token');expect(html).toContain('Confirm password');
  expect(html).toContain('minLength="15"');expect(html).toContain('maxLength="128"');
  expect(html).toContain('autoComplete="new-password"');
  expect(html).not.toContain('localStorage');
 });
});
