import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function SignUpPage() {
  return (
    <div className="auth-wrap">
      <div className="eyebrow">Account</div>
      <h1 className="display" style={{ fontSize: 34, margin: "6px 0 4px" }}>
        Create your InAuto account
      </h1>
      <p className="sub">Free. Track cars you own and want, list a car, and vet the next one.</p>
      <SignUp routing="path" path="/signup" signInUrl="/signin" fallbackRedirectUrl="/garage" />
    </div>
  );
}
