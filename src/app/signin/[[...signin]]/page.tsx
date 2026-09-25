import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage() {
  return (
    <div className="auth-wrap">
      <div className="eyebrow">Account</div>
      <h1 className="display" style={{ fontSize: 34, margin: "6px 0 4px" }}>
        Sign in to InAuto
      </h1>
      <p className="sub">
        Your garage, wish list, listings and private networks live behind your account.
      </p>
      <SignIn routing="path" path="/signin" signUpUrl="/signup" fallbackRedirectUrl="/garage" />
    </div>
  );
}
