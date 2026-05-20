export type FieldError = string

// ── Required text fields ──────────────────────────────────────────────────────

export function validateDisplayName(value: string): FieldError {
  if (value.trim().length < 2)
    return 'Display name is required and must be at least 2 characters.'
  if (value.trim().length > 150)
    return 'Display name must be 150 characters or fewer.'
  return ''
}

export function validateFirstName(value: string): FieldError {
  if (value.trim().length === 0) return 'First name is required.'
  if (value.trim().length > 50)
    return 'First name must be 50 characters or fewer.'
  return ''
}

export function validateLastName(value: string): FieldError {
  if (value.trim().length === 0) return 'Last name is required.'
  if (value.trim().length > 50)
    return 'Last name must be 50 characters or fewer.'
  return ''
}

// ── Optional fields — validate only when a value is provided ─────────────────

export function validateMiddleName(value: string): FieldError {
  if (value.length > 50) return 'Middle name must be 50 characters or fewer.'
  return ''
}

export function validateContactNumber(value: string): FieldError {
  if (!value) return ''
  if (value.length < 7 || value.length > 20)
    return 'Enter a valid phone number (7–20 characters).'
  if (!/^[0-9 +\-()]+$/.test(value))
    return 'Enter a valid phone number (digits, spaces, +, -, and parentheses only).'
  return ''
}

export function validateBirthDate(value: string): FieldError {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return 'Please enter a valid birth date.'
  const now = new Date()
  if (date > now) return 'Birth date cannot be in the future.'
  const minDate = new Date()
  minDate.setFullYear(minDate.getFullYear() - 120)
  if (date < minDate) return 'Please enter a valid birth date.'
  return ''
}

export function validateAvatarUrl(value: string): FieldError {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return 'Please enter a valid URL (must start with http:// or https://).'
  } catch {
    return 'Please enter a valid URL (must start with http:// or https://).'
  }
  return ''
}

// ── Address fields — optional, max-length only except postal code ─────────────

export function validatePostalCode(value: string): FieldError {
  if (!value) return ''
  if (value.length < 3 || value.length > 12) return 'Enter a valid postal code.'
  if (!/^[A-Za-z0-9 -]+$/.test(value)) return 'Enter a valid postal code.'
  return ''
}

export function validateMaxLength(
  value: string,
  max: number,
  label: string,
): FieldError {
  if (value.length > max) return `${label} must be ${max} characters or fewer.`
  return ''
}

// ── Full-form validation ──────────────────────────────────────────────────────

export interface ProfileErrors {
  name: FieldError
  avatarUrl: FieldError
  firstName: FieldError
  middleName: FieldError
  lastName: FieldError
  contactNumber: FieldError
  birthDate: FieldError
  buildingNo: FieldError
  street: FieldError
  city: FieldError
  province: FieldError
  postalCode: FieldError
  country: FieldError
}

export const EMPTY_PROFILE_ERRORS: ProfileErrors = {
  name: '',
  avatarUrl: '',
  firstName: '',
  middleName: '',
  lastName: '',
  contactNumber: '',
  birthDate: '',
  buildingNo: '',
  street: '',
  city: '',
  province: '',
  postalCode: '',
  country: '',
}

export function validateAllProfileFields(fields: {
  name: string
  avatarUrl: string
  firstName: string
  middleName: string
  lastName: string
  contactNumber: string
  birthDate: string
  buildingNo: string
  street: string
  city: string
  province: string
  postalCode: string
  country: string
}): ProfileErrors {
  return {
    name: validateDisplayName(fields.name),
    avatarUrl: validateAvatarUrl(fields.avatarUrl),
    firstName: validateFirstName(fields.firstName),
    middleName: validateMiddleName(fields.middleName),
    lastName: validateLastName(fields.lastName),
    contactNumber: validateContactNumber(fields.contactNumber),
    birthDate: validateBirthDate(fields.birthDate),
    buildingNo: validateMaxLength(fields.buildingNo, 50, 'Building number'),
    street: validateMaxLength(fields.street, 100, 'Street'),
    city: validateMaxLength(fields.city, 100, 'City'),
    province: validateMaxLength(fields.province, 100, 'Province'),
    postalCode: validatePostalCode(fields.postalCode),
    country: validateMaxLength(fields.country, 100, 'Country'),
  }
}

export function hasProfileErrors(errors: ProfileErrors): boolean {
  return Object.values(errors).some((e) => e !== '')
}
