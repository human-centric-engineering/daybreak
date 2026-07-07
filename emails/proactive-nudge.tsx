import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
} from '@react-email/components';
import { BRAND } from '@/lib/brand';

/**
 * Proactive-guidance nudge (f-overlays t-3b, F13) — a warm, user-facing "you have a next step
 * waiting" email sent to a journey owner whose journey has gone quiet but has an eligible next step.
 *
 * Deterministic copy (guidance is LLM-free). Intentionally generic: facilitation map nodes carry no
 * user-friendly label (only opaque keys), so the email invites the user back rather than naming the
 * raw node slug. The specific next step is recorded on the throttle row for audit, not shown here.
 */
export interface ProactiveNudgeEmailProps {
  /** The journey owner's display name (falls back to a friendly default). */
  userName: string;
  /** Base URL of the application (e.g. "https://example.com"). */
  baseUrl: string;
}

export default function ProactiveNudgeEmail({
  userName,
  baseUrl,
}: ProactiveNudgeEmailProps): React.ReactElement {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`You have a next step waiting in ${BRAND.name}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>A next step is waiting for you</Text>
            <Text style={text}>Hi {userName},</Text>
            <Text style={text}>
              It&apos;s been a little while since your last visit, and there&apos;s a next step
              ready for you to pick up in {BRAND.name} whenever you&apos;re ready.
            </Text>
            <Button href={baseUrl} style={button}>
              Continue where you left off
            </Button>
            <Text style={footer}>
              You&apos;re receiving this because you have an active journey in progress. No action
              is required — it&apos;ll be here when you return.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles (mirrors the shipped user-facing templates, e.g. welcome.tsx).
const main: React.CSSProperties = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '580px',
};

const section: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '40px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
};

const heading: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#1a1a1a',
  marginBottom: '24px',
  marginTop: '0',
};

const text: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#333333',
  marginBottom: '16px',
};

const button: React.CSSProperties = {
  backgroundColor: '#000000',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
  marginTop: '24px',
  marginBottom: '24px',
};

const footer: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#666666',
  marginTop: '24px',
  marginBottom: '8px',
};
