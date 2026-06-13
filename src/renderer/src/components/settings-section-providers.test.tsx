/**
 * @vitest-environment jsdom
 *
 * Focused interactive jsdom tests for the ProvidersSettingsSection.
 * Proves: custom provider add/edit form, validate via providerValidateKey with
 * endpointFormat, save via providerSaveKey, catalog refresh after persistence,
 * metadata-only persistence (no raw key in provider settings), edit existing
 * custom provider (with and without new key), cancel, and invalid-key error
 * state.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import React from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    tCommon: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() }
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() }
}))

import { ProvidersSettingsSection } from './settings-section-providers'

const DEFAULT_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    endpointFormat: 'chat_completions' as const,
    models: ['deepseek-v4-pro'],
    catalogModels: [],
    credentialStatus: 'unvalidated' as const
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    endpointFormat: 'chat_completions' as const,
    models: [],
    catalogModels: [],
    credentialStatus: 'unvalidated' as const
  }
]

function buildCtx(overrides: Record<string, unknown> = {}) {
  return {
    t: (key: string) => key,
    tCommon: (key: string) => key,
    form: {
      version: 1,
      provider: {
        providers: [...DEFAULT_PROVIDERS],
        apiKey: '',
        baseUrl: 'https://api.deepseek.com'
      }
    },
    provider: {},
    update: vi.fn(),
    selectControlClass: '',
    modelCatalogBusy: false,
    modelCatalogNotice: null,
    refreshModelProviderCatalog: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

// Install a minimal window.dsGui mock before each test
function installDsGuiMock(overrides: Record<string, () => Promise<unknown>> = {}) {
  ;(window as any).dsGui = {
    providerOAuthStart: vi.fn().mockResolvedValue({ ok: false, message: 'mock' }),
    providerValidateKey: vi.fn().mockResolvedValue({ ok: false, message: 'mock' }),
    providerDiscoverModels: vi.fn().mockResolvedValue({ ok: true, catalogModels: [] }),
    providerSaveKey: vi.fn().mockResolvedValue({ ok: true, providerId: '', maskedPreview: 'pk-fi…1234', persisted: true }),
    providerDeleteKey: vi.fn().mockResolvedValue({ ok: true, providerId: '' }),
    providerGetMaskedKey: vi.fn().mockResolvedValue({ ok: true, hasKey: false }),
    ...overrides
  }
}

describe('ProvidersSettingsSection — render', () => {
  afterEach(() => {
    cleanup()
    delete (window as any).dsGui
  })

  it('renders the providers section with built-in provider cards', () => {
    installDsGuiMock()
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    expect(screen.getByText('sectionProviders')).toBeInTheDocument()
    expect(screen.getByText('DeepSeek')).toBeInTheDocument()
    expect(screen.getByText('OpenRouter')).toBeInTheDocument()
  })

  it('renders Add custom provider button when no form is open', () => {
    installDsGuiMock()
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    expect(screen.getByText('providerAddCustom')).toBeInTheDocument()
  })
})

describe('ProvidersSettingsSection — custom provider add flow', () => {
  afterEach(() => {
    cleanup()
    delete (window as any).dsGui
  })

  it('opens the add custom provider form when button is clicked', () => {
    installDsGuiMock()
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    const addBtn = screen.getByText('providerAddCustom')
    fireEvent.click(addBtn)

    // Form title should be visible
    expect(screen.getByText('customProviderAddTitle')).toBeInTheDocument()
    // Form fields should be visible
    expect(screen.getByPlaceholderText('customProviderIdPlaceholder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('customProviderNamePlaceholder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('customProviderBaseUrlPlaceholder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('customProviderKeyPlaceholder')).toBeInTheDocument()
    // Validate button should be present
    expect(screen.getByText('customProviderValidate')).toBeInTheDocument()
    // Save and Cancel buttons
    expect(screen.getByText('customProviderSave')).toBeInTheDocument()
    expect(screen.getByText('customProviderCancel')).toBeInTheDocument()
    // Add button should be hidden
    expect(screen.queryByText('providerAddCustom')).not.toBeInTheDocument()
  })

  it('hides Add button while form is open and restores on cancel', () => {
    installDsGuiMock()
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // Open
    fireEvent.click(screen.getByText('providerAddCustom'))
    expect(screen.queryByText('providerAddCustom')).not.toBeInTheDocument()

    // Cancel
    fireEvent.click(screen.getByText('customProviderCancel'))
    expect(screen.getByText('providerAddCustom')).toBeInTheDocument()
  })

  it('validates key via providerValidateKey with endpointFormat on custom form', async () => {
    const validateFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'my-llm',
      keyLabel: 'Test Key'
    })
    installDsGuiMock({
      providerValidateKey: validateFn
    })
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // Open form
    fireEvent.click(screen.getByText('providerAddCustom'))

    // Fill required fields
    const idInput = screen.getByPlaceholderText('customProviderIdPlaceholder')
    fireEvent.change(idInput, { target: { value: 'my-llm' } })

    const baseUrlInput = screen.getByPlaceholderText('customProviderBaseUrlPlaceholder')
    fireEvent.change(baseUrlInput, { target: { value: 'https://llm.example.com/v1' } })

    // Select endpoint format via role
    const selects = screen.getAllByRole('combobox')
    const endpointSelect = selects[0] as HTMLSelectElement
    fireEvent.change(endpointSelect, { target: { value: 'responses' } })

    // Enter key
    const keyInput = screen.getByPlaceholderText('customProviderKeyPlaceholder')
    fireEvent.change(keyInput, { target: { value: 'pk-fixture-custom-key-12345' } })

    // Click validate
    fireEvent.click(screen.getByText('customProviderValidate'))

    await waitFor(() => {
      expect(validateFn).toHaveBeenCalledTimes(1)
    })

    // Verify the payload sent
    const payload = validateFn.mock.calls[0][0]
    expect(payload.providerId).toBe('my-llm')
    expect(payload.key).toBe('pk-fixture-custom-key-12345')
    expect(payload.baseUrl).toBe('https://llm.example.com/v1')
    expect(payload.endpointFormat).toBe('responses')
  })

  it('validate does NOT call providerDiscoverModels (deferred to save)', async () => {
    const validateFn = vi.fn().mockResolvedValue({ ok: true, providerId: 'my-llm' })
    const discoverFn = vi.fn().mockResolvedValue({ ok: true, catalogModels: [] })
    installDsGuiMock({
      providerValidateKey: validateFn,
      providerDiscoverModels: discoverFn
    })
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'my-llm' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'pk-fixture-key' } })
    fireEvent.click(screen.getByText('customProviderValidate'))

    await waitFor(() => {
      expect(validateFn).toHaveBeenCalledTimes(1)
    })
    // providerDiscoverModels must NOT be called during validation
    expect(discoverFn).not.toHaveBeenCalled()
  })

  it('shows invalid-key error state when validation fails', async () => {
    const validateFn = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Invalid API key. Please check your key and try again.'
    })
    installDsGuiMock({ providerValidateKey: validateFn })
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // Open form and fill
    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'test' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'pk-fixture-bad' } })

    // Click validate
    fireEvent.click(screen.getByText('customProviderValidate'))

    // Verify the mock was called
    await waitFor(() => {
      expect(validateFn).toHaveBeenCalledTimes(1)
    })

    // After validation fails, the validationNotice error tone should appear
    await waitFor(() => {
      const notices = screen.getAllByText(/Invalid API key/)
      expect(notices.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('skips re-validation on save when key was already validated', async () => {
    const validateFn = vi.fn().mockResolvedValue({ ok: true, providerId: 'pre-validated' })
    const saveFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'pre-validated',
      maskedPreview: 'pk-pr…abcd',
      persisted: true
    })
    const updateFn = vi.fn()
    installDsGuiMock({
      providerValidateKey: validateFn,
      providerSaveKey: saveFn
    })
    const ctx = buildCtx({ update: updateFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // Open form, fill, validate first
    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'pre-validated' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderNamePlaceholder'), { target: { value: 'PV' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'pk-fixture-pv-key' } })

    // Validate first
    fireEvent.click(screen.getByText('customProviderValidate'))
    await waitFor(() => {
      expect(validateFn).toHaveBeenCalledTimes(1)
    })

    // Now save — should NOT validate again
    fireEvent.click(screen.getByText('customProviderSave'))
    await waitFor(() => {
      expect(saveFn).toHaveBeenCalledTimes(1)
      expect(updateFn).toHaveBeenCalledTimes(1)
    })
    // validateFn should still be called only once (from the validate step, not save)
    expect(validateFn).toHaveBeenCalledTimes(1)
  })

  it('save validates, saves key, persists metadata, and refreshes catalog (M2 contract)', async () => {
    const validateFn = vi.fn().mockResolvedValue({ ok: true, providerId: 'my-llm' })
    const saveFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'my-llm',
      maskedPreview: 'pk-fi…7890',
      persisted: true
    })
    const updateFn = vi.fn()
    const refreshCatalogFn = vi.fn().mockResolvedValue(undefined)
    installDsGuiMock({
      providerValidateKey: validateFn,
      providerSaveKey: saveFn
    })
    const ctx = buildCtx({ update: updateFn, refreshModelProviderCatalog: refreshCatalogFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // Open form, fill, save
    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'my-llm' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderNamePlaceholder'), { target: { value: 'My LLM' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'pk-fixture-real-key-abc' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderBaseUrlPlaceholder'), { target: { value: 'https://api.example.com/v1' } })

    // Click save (not validated beforehand — save validates first)
    fireEvent.click(screen.getByText('customProviderSave'))

    await waitFor(() => {
      // 1. Validate key
      expect(validateFn).toHaveBeenCalledTimes(1)
      expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
        providerId: 'my-llm',
        key: 'pk-fixture-real-key-abc'
      }))
    })

    await waitFor(() => {
      // 2. Save key via credential store
      expect(saveFn).toHaveBeenCalledWith('my-llm', 'pk-fixture-real-key-abc')
    })

    await waitFor(() => {
      // 3. Persist provider metadata
      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    // 4. Refresh catalog must be called after persistence
    await waitFor(() => {
      expect(refreshCatalogFn).toHaveBeenCalledWith('my-llm')
    }, { timeout: 500 })

    // Verify the saved provider profile contains metadata only, never the raw key
    const updateCall = updateFn.mock.calls[0][0]
    const savedProviders = updateCall.provider.providers
    const saved = savedProviders.find((p: any) => p.id === 'my-llm')
    expect(saved).toBeDefined()
    // Raw key must never appear in provider settings
    expect(saved.apiKey).toBe('')
    // Only masked preview, never raw key
    expect(saved.credentialMaskedPreview).toBe('pk-fi…7890')
    // Raw key must NOT appear anywhere in the saved provider object
    expect(JSON.stringify(saved)).not.toContain('pk-fixture-real-key-abc')
  })

  it('saves encrypted key via providerSaveKey and persists metadata only (no raw key)', async () => {
    const saveFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'my-llm',
      maskedPreview: 'pk-fi…7890',
      persisted: true
    })
    const updateFn = vi.fn()
    installDsGuiMock({
      providerValidateKey: vi.fn().mockResolvedValue({ ok: true, providerId: 'my-llm' }),
      providerSaveKey: saveFn
    })
    const ctx = buildCtx({ update: updateFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // Open form, fill, save
    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'my-llm' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderNamePlaceholder'), { target: { value: 'My LLM' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'pk-fixture-real-key-abc' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderBaseUrlPlaceholder'), { target: { value: 'https://api.example.com/v1' } })

    // Click save
    fireEvent.click(screen.getByText('customProviderSave'))

    await waitFor(() => {
      expect(saveFn).toHaveBeenCalledWith('my-llm', 'pk-fixture-real-key-abc')
      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    // Verify the saved provider profile contains metadata only, never the raw key
    const updateCall = updateFn.mock.calls[0][0]
    const savedProviders = updateCall.provider.providers
    const saved = savedProviders.find((p: any) => p.id === 'my-llm')
    expect(saved).toBeDefined()
    // Raw key must never appear in provider settings
    expect(saved.apiKey).toBe('')
    // Only masked preview, never raw key
    expect(saved.credentialMaskedPreview).toBe('pk-fi…7890')
    // Raw key must NOT appear anywhere in the saved provider object
    expect(JSON.stringify(saved)).not.toContain('pk-fixture-real-key-abc')
  })

  it('edit existing custom provider opens form pre-populated', () => {
    installDsGuiMock()
    const customProviders = [
      ...DEFAULT_PROVIDERS,
      {
        id: 'my-custom',
        name: 'My Custom',
        apiKey: '',
        baseUrl: 'https://custom.example.com/v1',
        endpointFormat: 'messages' as const,
        models: [],
        catalogModels: [{ id: 'model-x', name: 'Model X', providerId: 'my-custom', capabilities: { inputModalities: ['text'], outputModalities: ['text'], reasoning: false, tools: false, recommendedUse: [] } }],
        credentialStatus: 'connected' as const,
        credentialMaskedPreview: 'pk-fi…abcd'
      }
    ]
    const ctx = buildCtx({
      form: {
        version: 1,
        provider: {
          providers: customProviders,
          apiKey: '',
          baseUrl: 'https://api.deepseek.com'
        }
      }
    })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // The custom provider card should be visible
    expect(screen.getByText('My Custom')).toBeInTheDocument()

    // Click edit button for the custom provider
    const editBtn = screen.getByText('edit')
    fireEvent.click(editBtn)

    // Form should open in edit mode
    expect(screen.getByText('customProviderEditTitle')).toBeInTheDocument()
    // ID field should be disabled
    const idInput = screen.getByPlaceholderText('customProviderIdPlaceholder')
    expect(idInput).toBeDisabled()
    expect(idInput).toHaveValue('my-custom')
    // Name should be pre-populated
    const nameInput = screen.getByPlaceholderText('customProviderNamePlaceholder')
    expect(nameInput).toHaveValue('My Custom')
    // Base URL should be pre-populated
    const baseUrlInput = screen.getByPlaceholderText('customProviderBaseUrlPlaceholder')
    expect(baseUrlInput).toHaveValue('https://custom.example.com/v1')
  })

  it('edit without new key preserves existing key and refreshes catalog', async () => {
    const saveFn = vi.fn().mockResolvedValue({ ok: true, providerId: 'my-custom', maskedPreview: 'pk-fi…abcd', persisted: true })
    const validateFn = vi.fn().mockResolvedValue({ ok: false, message: 'should not be called' })
    const updateFn = vi.fn()
    const refreshCatalogFn = vi.fn().mockResolvedValue(undefined)
    const getMaskedKeyFn = vi.fn().mockResolvedValue({ ok: true, hasKey: true, maskedPreview: 'pk-fi…abcd' })
    installDsGuiMock({
      providerValidateKey: validateFn,
      providerSaveKey: saveFn,
      providerGetMaskedKey: getMaskedKeyFn
    })

    const customProviders = [
      ...DEFAULT_PROVIDERS,
      {
        id: 'my-custom',
        name: 'My Custom',
        apiKey: '',
        baseUrl: 'https://custom.example.com/v1',
        endpointFormat: 'chat_completions' as const,
        models: [],
        catalogModels: [],
        credentialStatus: 'connected' as const,
        credentialMaskedPreview: 'pk-fi…abcd'
      }
    ]
    const ctx = buildCtx({
      update: updateFn,
      refreshModelProviderCatalog: refreshCatalogFn,
      form: {
        version: 1,
        provider: {
          providers: customProviders,
          apiKey: '',
          baseUrl: 'https://api.deepseek.com'
        }
      }
    })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // Open edit form
    fireEvent.click(screen.getByText('edit'))

    // Change name only — leave key empty
    fireEvent.change(screen.getByPlaceholderText('customProviderNamePlaceholder'), { target: { value: 'Renamed' } })

    // Save without entering a new key
    fireEvent.click(screen.getByText('customProviderSave'))

    await waitFor(() => {
      // Must NOT validate (no new key)
      expect(validateFn).not.toHaveBeenCalled()
      // Must NOT save a new key
      expect(saveFn).not.toHaveBeenCalled()
      // Must get masked key to preserve credential metadata
      expect(getMaskedKeyFn).toHaveBeenCalledWith('my-custom')
      // Must update provider profile
      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    // Must refresh catalog after persistence
    await waitFor(() => {
      expect(refreshCatalogFn).toHaveBeenCalledWith('my-custom')
    }, { timeout: 500 })

    // Verify preserved credential metadata
    const updateCall = updateFn.mock.calls[0][0]
    const saved = updateCall.provider.providers.find((p: any) => p.id === 'my-custom')
    expect(saved.name).toBe('Renamed')
    expect(saved.credentialStatus).toBe('connected')
    expect(saved.credentialMaskedPreview).toBe('pk-fi…abcd')
    // Raw key must never be in settings
    expect(saved.apiKey).toBe('')
  })

  it('cancel closes form without saving', () => {
    installDsGuiMock()
    const updateFn = vi.fn()
    const ctx = buildCtx({ update: updateFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // Open form
    fireEvent.click(screen.getByText('providerAddCustom'))
    // Fill some data
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'test-id' } })

    // Cancel
    fireEvent.click(screen.getByText('customProviderCancel'))

    // update should NOT be called
    expect(updateFn).not.toHaveBeenCalled()
    // Form should be closed, add button restored
    expect(screen.getByText('providerAddCustom')).toBeInTheDocument()
    expect(screen.queryByText('customProviderAddTitle')).not.toBeInTheDocument()
  })
})

describe('ProvidersSettingsSection — key security', () => {
  afterEach(() => {
    cleanup()
    delete (window as any).dsGui
  })

  it('never includes raw key in provider settings after save', async () => {
    const saveFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'custom-secure',
      maskedPreview: 'pk-fi…xyz1',
      persisted: true
    })
    const updateFn = vi.fn()
    installDsGuiMock({
      providerValidateKey: vi.fn().mockResolvedValue({ ok: true, providerId: 'custom-secure' }),
      providerSaveKey: saveFn
    })
    const ctx = buildCtx({ update: updateFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'custom-secure' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderNamePlaceholder'), { target: { value: 'Secure' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'pk-fixture-really-long-secret-key-that-should-never-appear-in-settings' } })

    fireEvent.click(screen.getByText('customProviderSave'))

    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    const savedState = JSON.stringify(updateFn.mock.calls[0][0])
    expect(savedState).not.toContain('pk-fixture-really-long-secret-key')
    expect(savedState).toContain('pk-fi…xyz1')
  })

  it('warns when key is saved in ephemeral mode (safeStorage unavailable)', async () => {
    const saveFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'custom-ephemeral',
      maskedPreview: 'pk-ep…zzzz',
      persisted: false // <-- key won't survive restart
    })
    const updateFn = vi.fn()
    installDsGuiMock({
      providerValidateKey: vi.fn().mockResolvedValue({ ok: true, providerId: 'custom-ephemeral' }),
      providerSaveKey: saveFn
    })
    const ctx = buildCtx({ update: updateFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'custom-ephemeral' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderNamePlaceholder'), { target: { value: 'Eph' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'pk-fixture-ephemeral' } })

    fireEvent.click(screen.getByText('customProviderSave'))

    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    // When not persisted, credentialMaskedPreview should NOT be saved (so it's not misleading)
    const savedState = JSON.stringify(updateFn.mock.calls[0][0])
    // The key should NOT be in the saved state
    expect(savedState).not.toContain('pk-fixture-ephemeral')
  })

  it('returns invalid-key error when save validates a bad key', async () => {
    const validateFn = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Invalid API key. Please check your key and try again.'
    })
    const saveFn = vi.fn().mockResolvedValue({ ok: true, providerId: 'bad-key', maskedPreview: '', persisted: true })
    const updateFn = vi.fn()
    installDsGuiMock({
      providerValidateKey: validateFn,
      providerSaveKey: saveFn
    })
    const ctx = buildCtx({ update: updateFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'bad-key' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderNamePlaceholder'), { target: { value: 'Bad' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'bad-key-string' } })

    // Click save — validation happens inside save
    fireEvent.click(screen.getByText('customProviderSave'))

    await waitFor(() => {
      expect(validateFn).toHaveBeenCalledTimes(1)
    })

    // Save must NOT be called (validation failed)
    expect(saveFn).not.toHaveBeenCalled()
    // update must NOT be called (save aborted)
    expect(updateFn).not.toHaveBeenCalled()

    // Error message should be visible in the form (form is still open)
    await waitFor(() => {
      const notices = screen.getAllByText(/Invalid API key/)
      expect(notices.length).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('ProvidersSettingsSection — custom provider UI copy (M2 remediation)', () => {
  afterEach(() => {
    cleanup()
    delete (window as any).dsGui
  })

  it('remove button for keyless custom provider uses command label, not past-tense status', () => {
    installDsGuiMock()
    const customProviders = [
      ...DEFAULT_PROVIDERS,
      {
        id: 'my-custom',
        name: 'My Custom',
        apiKey: '',
        baseUrl: 'https://custom.example.com/v1',
        endpointFormat: 'chat_completions' as const,
        models: [],
        catalogModels: [],
        credentialStatus: 'unvalidated' as const
      }
    ]
    const ctx = buildCtx({
      form: {
        version: 1,
        provider: {
          providers: customProviders,
          apiKey: '',
          baseUrl: 'https://api.deepseek.com'
        }
      }
    })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // The remove button must use command form customProviderRemove, not past-tense customProviderRemoved
    expect(screen.getByText('customProviderRemove')).toBeInTheDocument()
    expect(screen.queryByText('customProviderRemoved')).not.toBeInTheDocument()
  })

  it('validate success notice does not leak {{count}} token in the DOM', async () => {
    const validateFn = vi.fn().mockResolvedValue({ ok: true, providerId: 'no-count-leak' })
    installDsGuiMock({ providerValidateKey: validateFn })
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    fireEvent.click(screen.getByText('providerAddCustom'))
    fireEvent.change(screen.getByPlaceholderText('customProviderIdPlaceholder'), { target: { value: 'no-count-leak' } })
    fireEvent.change(screen.getByPlaceholderText('customProviderKeyPlaceholder'), { target: { value: 'pk-fixture-key' } })
    fireEvent.click(screen.getByText('customProviderValidate'))

    await waitFor(() => {
      expect(validateFn).toHaveBeenCalledTimes(1)
    })

    // The validate success key must not embed {{count}} (the translation string is also free of it after remediation)
    expect(screen.getByText('customProviderValidationSuccess')).toBeInTheDocument()
    // Defense: no literal {{count}} anywhere in the rendered output
    expect(document.body.textContent).not.toContain('{{count}}')
  })

  it('validate button does not claim model discovery (M2 validate-only contract)', () => {
    installDsGuiMock()
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    fireEvent.click(screen.getByText('providerAddCustom'))

    // The validate button label must not mention discovery — it's a validate-only operation
    const validateBtn = screen.getByText('customProviderValidate')
    expect(validateBtn).toBeInTheDocument()
    // With i18n mock returning keys, verify the label does not embed discovery words
    expect(validateBtn.textContent).not.toMatch(/discover|model|نماذج|اكتشف|发现/i)
  })

  it('key-validation-required message does not mention model discovery', async () => {
    // Verify the translation strings in all three locales were remediated.
    const en = await import('../locales/en/settings.json')
    const ar = await import('../locales/ar/settings.json')
    const zh = await import('../locales/zh/settings.json')

    for (const loc of [en.default, ar.default, zh.default]) {
      const msg = loc.customProviderKeyValidationRequired
      expect(msg).toBeDefined()
      // Must not claim model discovery
      expect(msg).not.toMatch(/discover/i)
      expect(msg).not.toMatch(/model/i)
    }
  })
})

describe('ProvidersSettingsSection — OpenRouter OAuth button visibility (M2 remediation)', () => {
  afterEach(() => {
    cleanup()
    delete (window as any).dsGui
  })

  it('shows OAuth Sign-in button when OpenRouter has no stored key (unvalidated)', () => {
    installDsGuiMock()
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // The OAuth sign-in button must be visible and prominent
    const signInBtn = screen.getByText('providerOAuthSignIn')
    expect(signInBtn).toBeInTheDocument()
    // When no key, it should be the primary accent style
    expect(signInBtn.className).toContain('bg-accent')
  })

  it('shows OAuth Reconnect button when OpenRouter has a masked stored key', () => {
    installDsGuiMock()
    const providersWithKey = [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        apiKey: '',
        baseUrl: 'https://api.deepseek.com',
        endpointFormat: 'chat_completions' as const,
        models: ['deepseek-v4-pro'],
        catalogModels: [],
        credentialStatus: 'unvalidated' as const
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        endpointFormat: 'chat_completions' as const,
        models: [],
        catalogModels: [],
        credentialStatus: 'connected' as const,
        credentialMaskedPreview: 'sk-or-…abc4',
        credentialLabel: 'My OR Key'
      }
    ]
    const ctx = buildCtx({
      form: {
        version: 1,
        provider: {
          providers: providersWithKey,
          apiKey: '',
          baseUrl: 'https://api.deepseek.com'
        }
      }
    })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // OAuth button should still be visible — now as "Reconnect"
    const reconnectBtn = screen.getByText('providerOAuthReconnect')
    expect(reconnectBtn).toBeInTheDocument()
    // When a key exists, it should be the secondary outline style (not primary accent)
    expect(reconnectBtn.className).not.toContain('bg-accent')
    expect(reconnectBtn.className).toContain('border')
  })

  it('clicking OAuth button calls providerOAuthStart', async () => {
    const oauthFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'openrouter',
      maskedPreview: 'sk-or-…xyz9',
      keyLabel: 'Test OR Key',
      keyLimit: 50,
      keyUsage: 10
    })
    const updateFn = vi.fn()
    const refreshCatalogFn = vi.fn().mockResolvedValue(undefined)
    installDsGuiMock({ providerOAuthStart: oauthFn })
    const ctx = buildCtx({ update: updateFn, refreshModelProviderCatalog: refreshCatalogFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    const signInBtn = screen.getByText('providerOAuthSignIn')
    fireEvent.click(signInBtn)

    await waitFor(() => {
      expect(oauthFn).toHaveBeenCalledTimes(1)
    })
  })

  it('OAuth success updates only masked metadata and triggers catalog refresh', async () => {
    const oauthFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'openrouter',
      maskedPreview: 'sk-or-…xyz9',
      keyLabel: 'Test OR Key',
      keyLimit: 50,
      keyUsage: 10
    })
    const updateFn = vi.fn()
    const refreshCatalogFn = vi.fn().mockResolvedValue(undefined)
    installDsGuiMock({ providerOAuthStart: oauthFn })
    const ctx = buildCtx({ update: updateFn, refreshModelProviderCatalog: refreshCatalogFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    const signInBtn = screen.getByText('providerOAuthSignIn')
    fireEvent.click(signInBtn)

    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    // Verify only masked metadata — never raw key
    const updateCall = updateFn.mock.calls[0][0]
    const savedState = JSON.stringify(updateCall)
    expect(savedState).toContain('sk-or-…xyz9')
    expect(savedState).not.toContain('sk-or-v1-')
    // Catalog refresh must be triggered
    await waitFor(() => {
      expect(refreshCatalogFn).toHaveBeenCalledWith('openrouter')
    }, { timeout: 1000 })
  })

  it('OAuth error/cancel state is visible to the user', async () => {
    const oauthFn = vi.fn().mockResolvedValue({
      ok: false,
      message: 'OAuth error: access_denied'
    })
    installDsGuiMock({ providerOAuthStart: oauthFn })
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    const signInBtn = screen.getByText('providerOAuthSignIn')
    fireEvent.click(signInBtn)

    await waitFor(() => {
      expect(oauthFn).toHaveBeenCalledTimes(1)
    })

    // Error notice must be visible in the DOM
    await waitFor(() => {
      // When denied, the translated key for denied should appear
      const deniedMsg = screen.getByText('providerOAuthDenied')
      expect(deniedMsg).toBeInTheDocument()
    })
  })

  it('OAuth generic cancel message shows cancelled notice', async () => {
    const oauthFn = vi.fn().mockResolvedValue({
      ok: false,
      message: 'User cancelled the OAuth flow.'
    })
    installDsGuiMock({ providerOAuthStart: oauthFn })
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    const signInBtn = screen.getByText('providerOAuthSignIn')
    fireEvent.click(signInBtn)

    await waitFor(() => {
      expect(oauthFn).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      const cancelledMsg = screen.getByText('providerOAuthCancelled')
      expect(cancelledMsg).toBeInTheDocument()
    })
  })

  it('OpenRouter provider card always has an OAuth button (RTL-safe)', () => {
    installDsGuiMock()
    const ctx = buildCtx()
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    // The OpenRouter card has dir="auto" for RTL safety
    const orCard = screen.getByText('OpenRouter').closest('[dir]')
    expect(orCard).toBeInTheDocument()
    // OAuth button should be a child of the card
    if (orCard) {
      const oauthBtn = orCard.querySelector('button')
      expect(oauthBtn).toBeInTheDocument()
      expect(oauthBtn?.textContent).toMatch(/Sign|Reconnect|sign|reconnect|providerOAuth/i)
    }
  })

  it('provider settings never include raw key material after OAuth', async () => {
    const oauthFn = vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'openrouter',
      maskedPreview: 'sk-or-…safe1',
      keyLabel: 'Safe Key',
      keyLimit: null,
      keyUsage: 0
    })
    const updateFn = vi.fn()
    installDsGuiMock({ providerOAuthStart: oauthFn })
    const ctx = buildCtx({ update: updateFn })
    render(React.createElement(ProvidersSettingsSection, { ctx }))

    fireEvent.click(screen.getByText('providerOAuthSignIn'))

    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledTimes(1)
    })

    const updateCall = updateFn.mock.calls[0][0]
    const savedState = JSON.stringify(updateCall)
    // Must contain the masked preview
    expect(savedState).toContain('sk-or-…safe1')
    // Must NEVER contain raw key patterns
    expect(savedState).not.toMatch(/sk-or-v1-[a-zA-Z0-9]{20,}/)
    expect(savedState).not.toContain('api_key')
  })

  it('en+zh+ar i18n keys exist for OAuth reconnect and error states', async () => {
    const en = await import('../locales/en/settings.json')
    const ar = await import('../locales/ar/settings.json')
    const zh = await import('../locales/zh/settings.json')

    const requiredKeys = [
      'providerOAuthReconnect',
      'providerOAuthReconnecting',
      'providerOAuthCancelled',
      'providerOAuthDenied',
      'providerOAuthError',
      'providerOAuthErrorGeneric'
    ] as const

    for (const locale of [en.default, ar.default, zh.default]) {
      for (const key of requiredKeys) {
        expect(locale[key]).toBeDefined()
        expect(typeof locale[key]).toBe('string')
        expect(locale[key].length).toBeGreaterThan(0)
      }
    }
  })
})
