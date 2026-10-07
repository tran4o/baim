import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, parse } from 'node:path';

export const PC_PRIMARY = 'C:/Users/SveBiS/Desktop/myStuff/2026_GitPro/baim-local-active';
export const VPS_ROOT = '/home/ZeShad/baim';

// Inspect every existing component, including junctions, before trusting realpath.
export function assertNoLinks(path) {
  const full = resolve(path), base = parse(full).root;
  let current = base;
  for (const part of relative(base, full).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current)) {
      const st = lstatSync(current);
      if (st.isSymbolicLink() || resolve(realpathSync(current)).toLowerCase() !== resolve(current).toLowerCase()) {
        throw new Error('Unsafe linked/reparse path');
      }
    }
  }
  return full;
}

export function gitDirectory(root) {
  assertNoLinks(root);
  const dot = join(root, '.git');
  assertNoLinks(dot);
  const st = lstatSync(dot);
  if (st.isDirectory()) return dot;
  if (!st.isFile()) throw new Error('Unsafe Git directory');
  const match = readFileSync(dot, 'utf8').trim().match(/^gitdir: (.+)$/);
  if (!match) throw new Error('Invalid Git worktree pointer');
  const dir = resolve(root, match[1]);
  assertNoLinks(dir);
  if (!lstatSync(dir).isDirectory()) throw new Error('Missing Git worktree state');
  return dir;
}

// Machine-readable ACL inspection avoids localized icacls text and chmod fiction.
// Only paths enter this script. Credentials never enter a child process.
export function windowsACL(path, create = false, run = execFileSync, { inspectOnly = false } = {}) {
  const literal = path.replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop'; $p='${literal}';
    $item=if([System.IO.Directory]::Exists($p)){[System.IO.DirectoryInfo]::new($p)}else{[System.IO.FileInfo]::new($p)};
    $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;
    ${create ? `$acl=$item.GetAccessControl(); $acl.SetAccessRuleProtection($true,$false);
    foreach($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) };
    $acl.SetOwner($sid);
    $inherit=if($item -is [System.IO.DirectoryInfo]){3}else{0};
    foreach($who in @($sid.Value,'S-1-5-18')) {
      $r=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($who), 'FullControl', $inherit, 0, 'Allow');
      $acl.AddAccessRule($r)
    }; $item.SetAccessControl($acl);` : ''}
    $acl=$item.GetAccessControl();
    $rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object {
      @{sid=$_.IdentityReference.Value;allow=($_.AccessControlType -eq 'Allow');inherited=$_.IsInherited;rights=[int]$_.FileSystemRights}
    });
    @{owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;current=$sid.Value;protected=$acl.AreAccessRulesProtected;rules=$rules} | ConvertTo-Json -Depth 5 -Compress`;
  let value;
  try {
    value = JSON.parse(run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  } catch { throw new Error('Cannot establish/inspect private Windows ACL; stop before key entry'); }
  if (!inspectOnly || create) validateWindowsACL(value);
  return value;
}

// Explicit owner-invoked ACL migration only. Preflight the whole tree before
// touching permissions; preserve all bytes, labels, request IDs and records.
export function protectExistingState(base) {
  if (process.platform !== 'win32') throw new Error('Existing-state ACL protection is Windows-only');
  const entries = [];
  const visit = path => {
    assertNoLinks(path);
    const st = lstatSync(path);
    if ((!st.isDirectory() && !st.isFile()) || (st.isFile() && st.nlink !== 1) || entries.length >= 1000) throw new Error('Unsafe existing private state tree');
    const acl = windowsACL(path, false, execFileSync, { inspectOnly: true });
    if (acl.owner !== acl.current) throw new Error('Existing private state belongs to another Windows account; stop');
    entries.push(path);
    if (st.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name));
  };
  visit(base);
  // Child ACLs first avoid propagating an inherited rule over a child already
  // verified as protected. A partial failure remains fail-closed and visible.
  for (const path of entries.reverse()) windowsACL(path, true);
  return entries.length;
}

export function validateWindowsACL(value) {
  if (!value?.protected || value.owner !== value.current || !/^S-1-5-21-/.test(value.current || '')
      || !Array.isArray(value.rules) || !value.rules.length
      || !value.rules.some(rule => rule.allow && rule.sid === value.current && (rule.rights & 2032127) === 2032127)
      || value.rules.some(rule => !rule.allow || ![value.current, 'S-1-5-18'].includes(rule.sid))) {
    throw new Error('Private Windows ACL must allow only current owner and SYSTEM');
  }
}

export function assertPrivate(path) {
  assertNoLinks(path);
  const st = lstatSync(path);
  if ((!st.isFile() && !st.isDirectory()) || (st.isFile() && st.nlink !== 1)) throw new Error('Unsafe private state entry');
  if (process.platform === 'win32') windowsACL(path);
  else if (st.mode & 0o077) throw new Error('Private API state requires owner-only permissions');
}

export function privateDirectory(base, path) {
  assertNoLinks(base);
  const rel = relative(base, path);
  if (rel === '..' || /^\.\.[\\/]/.test(rel) || isAbsolute(rel)) throw new Error('Invalid private state path');
  let current = base;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    if (!existsSync(current)) {
      mkdirSync(current, { mode: 0o700 });
      if (process.platform === 'win32') windowsACL(current, true);
    }
    if (!lstatSync(current).isDirectory()) throw new Error('Unsafe private state directory');
    assertPrivate(current);
  }
}

export function privateReferencePath(root, logical) {
  if (!/^\.git\/ludo-api\/[a-z][a-z0-9-]{2,63}\/reference-[a-f0-9]{64}\.png$/.test(logical)) throw new Error('Unsafe prepared reference path');
  return join(gitDirectory(root), ...logical.split('/').slice(1));
}
