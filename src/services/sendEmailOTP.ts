import { sendOTPEmail as sendEmailJSOtp } from '../utils/sendOTP';

export interface SendOtpParams {
  email: string;
  name: string;
  regNo?: string;
}

export interface SendOtpResult {
  success: boolean;
  message: string;
  otpCode?: string;
  errorDetails?: string;
}

/**
 * Service helper to dispatch 6-digit OTP to user's email address.
 * Generates OTP via the local SQLite backend.
 * Attempts EmailJS if configured, but gracefully succeeds in local mode without requiring any API keys.
 */
export async function sendOTPEmail({ email, name, regNo }: SendOtpParams): Promise<SendOtpResult> {
  const trimmedEmail = email.trim();
  const trimmedName = name.trim();

  // 1. Pre-validation of target email string format
  if (!trimmedEmail) {
    return { success: false, message: 'Email address is required.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { success: false, message: 'Please enter a valid email address (e.g. name@domain.com).' };
  }

  try {
    // 2. Request OTP generation from backend (stores in SQLite & in-memory store)
    const backendRes = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedEmail, name: trimmedName, regNo: regNo?.trim() }),
    });

    const backendData = await backendRes.json();
    if (!backendData.success || !backendData.otpCode) {
      return {
        success: false,
        message: backendData.error || 'Failed to generate OTP code on server.',
      };
    }

    const generatedOtp = String(backendData.otpCode);

    // 3. Try EmailJS dispatch if available, but do not block local execution if it fails
    try {
      await sendEmailJSOtp(trimmedEmail, trimmedName, generatedOtp);
      return {
        success: true,
        message: `Verification code sent to ${trimmedEmail}.`,
        otpCode: generatedOtp,
      };
    } catch (emailjsErr: any) {
      // In local mode without external email API keys, report success with generated OTP
      console.info(`[Local Mode] Email dispatch skipped/simulated. OTP for ${trimmedEmail}: ${generatedOtp}`);
      return {
        success: true,
        message: backendData.sentViaGmail
          ? `Verification code sent to ${trimmedEmail} via Gmail.`
          : `Verification OTP generated: ${generatedOtp}`,
        otpCode: generatedOtp,
      };
    }
  } catch (error: any) {
    console.error('Error in sendOTPEmail service:', error);
    return {
      success: false,
      message: error?.message || 'Network error while initiating OTP.',
    };
  }
}

/**
 * Helper to verify entered 6-digit OTP code against server
 */
export async function verifyOTPEmail(email: string, otp: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      return { success: true, message: 'OTP verified successfully.' };
    } else {
      return { success: false, message: data.error || 'Invalid or expired OTP code.' };
    }
  } catch (err: any) {
    return { success: false, message: 'Failed to connect to verification server.' };
  }
}
