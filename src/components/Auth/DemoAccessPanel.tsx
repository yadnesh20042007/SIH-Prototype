'use client';

import { useState } from 'react';

interface DemoAccount {
  role: string;
  label: string;
  email: string;
  password: string;
  description: string;
  badgeColour: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'LAB_TECHNICIAN',
    label: 'Lab Technician',
    email: 'dev.lab.technician@nawi-r76.local',
    password: 'DemoTech2026!',
    description: 'Register instruments, record test observations, submit sessions for review.',
    badgeColour: '#0A66C2',
  },
  {
    role: 'REVIEWING_OFFICER',
    label: 'Reviewing Officer',
    email: 'dev.reviewing.officer@nawi-r76.local',
    password: 'DemoReview2026!',
    description: 'Review submitted sessions, approve or return for correction.',
    badgeColour: '#067647',
  },
  {
    role: 'APPROVING_OFFICER',
    label: 'Approving Officer',
    email: 'dev.approving.officer@nawi-r76.local',
    password: 'DemoApprove2026!',
    description: 'Grant final approval and trigger compliance report generation.',
    badgeColour: '#7B3F00',
  },
];

interface DemoAccessPanelProps {
  onFill: (email: string, password: string) => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available — silently fail
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      aria-label={copied ? 'Copied' : 'Copy'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        borderRadius: '4px',
        border: '1px solid #C9D5E1',
        background: copied ? '#EAF3FC' : '#F7F9FB',
        color: copied ? '#0A66C2' : '#667085',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <rect x="4" y="1" width="7" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
          <rect x="1" y="4" width="7" height="8" rx="1.2" fill="white" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )}
    </button>
  );
}

export function DemoAccessPanel({ onFill }: DemoAccessPanelProps) {
  return (
    <section
      aria-labelledby="demo-access-heading"
      style={{
        marginTop: '28px',
        borderTop: '1px solid #E4EAF0',
        paddingTop: '24px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.6rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#667085',
              background: '#F2F5F9',
              border: '1px solid #E4EAF0',
              borderRadius: '4px',
              padding: '2px 7px',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M4 1h4M5 1v4L2 10h8L7 5V1" stroke="#667085" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Demo Access
          </span>
          <span style={{ fontSize: '0.6rem', color: '#98A6B5', fontWeight: 500 }}>For Evaluators</span>
        </div>
        <h2
          id="demo-access-heading"
          style={{
            margin: 0,
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#344054',
            lineHeight: 1.4,
          }}
        >
          Explore Metrify using the demo accounts below.
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#98A6B5', lineHeight: 1.5 }}>
          Click &ldquo;Use Demo Account&rdquo; to pre-fill the form above, then click Sign In.
        </p>
      </div>

      {/* Cards */}
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
        role="list"
      >
        {DEMO_ACCOUNTS.map((account) => (
          <li
            key={account.role}
            style={{
              border: '1px solid #E4EAF0',
              borderRadius: '7px',
              background: '#FAFBFC',
              padding: '12px 14px',
            }}
          >
            {/* Role badge + description */}
            <div style={{ marginBottom: '10px' }}>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: account.badgeColour,
                  background: `${account.badgeColour}14`,
                  border: `1px solid ${account.badgeColour}30`,
                  borderRadius: '4px',
                  padding: '1px 6px',
                  marginBottom: '4px',
                }}
              >
                {account.label}
              </span>
              <p style={{ margin: 0, fontSize: '0.68rem', color: '#667085', lineHeight: 1.45 }}>
                {account.description}
              </p>
            </div>

            {/* Credentials */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
              {/* Email row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#F0F4F8',
                  borderRadius: '5px',
                  padding: '5px 8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    color: '#98A6B5',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    minWidth: '50px',
                    flexShrink: 0,
                  }}
                >
                  Email
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    color: '#344054',
                    wordBreak: 'break-all',
                  }}
                >
                  {account.email}
                </span>
                <CopyButton text={account.email} />
              </div>

              {/* Password row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#F0F4F8',
                  borderRadius: '5px',
                  padding: '5px 8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    color: '#98A6B5',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    minWidth: '50px',
                    flexShrink: 0,
                  }}
                >
                  Password
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    color: '#344054',
                  }}
                >
                  {account.password}
                </span>
                <CopyButton text={account.password} />
              </div>
            </div>

            {/* Use Demo Account button */}
            <button
              type="button"
              id={`use-demo-${account.role.toLowerCase().replace(/_/g, '-')}`}
              onClick={() => onFill(account.email, account.password)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                width: '100%',
                height: '32px',
                borderRadius: '5px',
                border: `1px solid ${account.badgeColour}40`,
                background: `${account.badgeColour}08`,
                color: account.badgeColour,
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `${account.badgeColour}14`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${account.badgeColour}70`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = `${account.badgeColour}08`;
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${account.badgeColour}40`;
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Use Demo Account
            </button>
          </li>
        ))}
      </ul>

      {/* Disclaimer */}
      <p
        style={{
          margin: '14px 0 0',
          fontSize: '0.63rem',
          color: '#B0BDC9',
          lineHeight: 1.5,
          textAlign: 'center',
        }}
      >
        Demo credentials are public and for evaluation only. No production data is affected.
      </p>
    </section>
  );
}
