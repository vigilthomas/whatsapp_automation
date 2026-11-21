import { describe, expect, it } from 'vitest'
import { suggestTemplateValues, type AutofillContext } from './template-autofill'

const ctx: AutofillContext = {
  contact: { name: 'Asha Menon', phone: '+919876543210', email: 'asha@example.com' },
  appointment: {
    starts_at: '2026-11-22T04:30:00Z', // 10:00 in Kolkata
    service: 'Root canal',
    doctor: 'Dr. Neha',
    branch: 'Edapally',
  },
  business: 'Dr.32 Dental Clinic',
  tz: 'Asia/Kolkata',
  locale: 'en-GB',
}

describe('suggestTemplateValues', () => {
  it('fills contact details by placeholder name', () => {
    expect(suggestTemplateValues(['name', 'first_name', 'phone', 'email'], true, ctx)).toEqual([
      'Asha Menon',
      'Asha',
      '+919876543210',
      'asha@example.com',
    ])
  })
  it("fills booking details from the contact's next booking, in the business timezone", () => {
    expect(suggestTemplateValues(['time', 'service', 'doctor', 'branch', 'business_name'], true, ctx)).toEqual([
      '10:00',
      'Root canal',
      'Dr. Neha',
      'Edapally',
      'Dr.32 Dental Clinic',
    ])
  })
  it('gives the booking date in the business timezone', () => {
    expect(suggestTemplateValues(['appointment_date'], true, ctx)[0]).toMatch(/22/)
  })
  it('accepts common spellings: customer_name, patient_name, stylist, clinic', () => {
    expect(suggestTemplateValues(['customer_name', 'patient_name', 'stylist', 'clinic'], true, ctx)).toEqual([
      'Asha Menon',
      'Asha Menon',
      'Dr. Neha',
      'Dr.32 Dental Clinic',
    ])
  })
  it('leaves unknown names and booking fields with no booking empty', () => {
    expect(suggestTemplateValues(['token_num', 'time'], true, { ...ctx, appointment: null })).toEqual(['', ''])
  })
  it('leaves numbered placeholders empty: {{1}} could mean anything', () => {
    expect(suggestTemplateValues(['1', '2'], false, ctx)).toEqual(['', ''])
  })
  it('falls back to the phone when the contact has no name', () => {
    expect(suggestTemplateValues(['name'], true, { ...ctx, contact: { name: null, phone: '+91 1', email: null } })).toEqual([
      '+91 1',
    ])
  })
})
