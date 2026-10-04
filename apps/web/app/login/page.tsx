import { readServerEnvironment } from "@unidash/config/env";
import { GoogleSignInButton } from "./google-button";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const environment = readServerEnvironment();
  const signInReady = Boolean(
    environment.DATABASE_URL
    && environment.GOOGLE_CLIENT_ID
    && environment.GOOGLE_CLIENT_SECRET
    && environment.AUTH_SECRET
    && environment.OWNER_EMAIL,
  );
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true">U</div>
        <p className="login-eyebrow">YOUR ACADEMIC RADAR</p>
        <h1 id="login-title">Sign in to UniDash</h1>
        <p className="login-copy">
          Use a Google account that has been invited to this private dashboard.
          Your AMS and Moodle accounts connect separately after sign-in.
        </p>
        <GoogleSignInButton enabled={signInReady} />
        {!signInReady ? (
          <p className="login-setup" role="status">
            Sign-in setup is incomplete. The site owner must configure Google OAuth, a PostgreSQL database, a stable auth secret, and an invited Google email before sign-in can start. Do not enter or share your Gmail password here.
          </p>
        ) : null}
        <p className="login-footnote">Only approved email addresses can enter.</p>
      </section>
    </main>
  );
}
