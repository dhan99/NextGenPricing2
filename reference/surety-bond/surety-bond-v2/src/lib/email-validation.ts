const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function isValidEmail(email: string): boolean {
  if (!email.trim()) return true;
  return EMAIL_REGEX.test(email.trim());
}

export function getEmailError(email: string): string | null {
  if (!email.trim()) return null;
  if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email address";
  return null;
}
