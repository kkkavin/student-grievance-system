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
 * Connects to FastAPI backend /api/auth/send-otp.
 */
export async function sendOTPEmail({ email, name, regNo }: SendOtpParams): Promise<SendOtpResult> {
  const trimmedEmail = email.trim();
  const trimmedName = name.trim();

  if (!trimmedEmail) {
    return { success: false, message: 'Email address is required.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { success: false, message: 'Please enter a valid email address (e.g. name@domain.com).' };
  }

  try {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedEmail, name: trimmedName, regNo: regNo?.trim() }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || `Verification code sent to ${trimmedEmail}. (Dev OTP: 123456)`,
        otpCode: data.otp || data.otpCode || '123456',
      };
    }

    return {
      success: false,
      message: data.error || data.detail || 'Failed to generate OTP on server.',
    };
  } catch (error: any) {
    console.error('Error in sendOTPEmail service:', error);
    return {
      success: false,
      message: error?.message || 'Network error while initiating OTP.',
    };
  }
}

/**
 * Helper to verify entered 6-digit OTP code against server.
 */
export async function verifyOTPEmail(email: string, otp: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, message: data.message || 'OTP verified successfully.' };
    }
    return { success: false, message: data.error || data.detail || 'Invalid or expired OTP code.' };
  } catch (err: any) {
    return { success: false, message: 'Failed to connect to verification server.' };
  }
}
