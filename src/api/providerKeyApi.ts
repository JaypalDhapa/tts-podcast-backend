import { http, USE_MOCK_API } from "./httpClient";
import { generateId } from "@/utils/id";
import type { ProviderApiKeyStatus, TTSProvider } from "@/types/domain";

const MOCK_STORAGE_KEY = "podcast_studio_mock_provider_keys_v1";

function loadMockKeys(): ProviderApiKeyStatus[] {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMockKeys(keys: ProviderApiKeyStatus[]) {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(keys));
}

export const providerKeyApi = {
  async list(provider?: TTSProvider): Promise<ProviderApiKeyStatus[]> {
    if (USE_MOCK_API) {
      const keys = loadMockKeys();
      return provider ? keys.filter((k) => k.provider === provider) : keys;
    }
    const query = provider ? `?provider=${provider}` : "";
    return http.get<ProviderApiKeyStatus[]>(`/api/provider-keys${query}`);
  },

  async create(provider: TTSProvider, apiKey: string, label?: string): Promise<ProviderApiKeyStatus> {
    if (USE_MOCK_API) {
      const keys = loadMockKeys();
      const existingCount = keys.filter((k) => k.provider === provider).length;
      const created: ProviderApiKeyStatus = {
        id: generateId("mockkey"),
        provider,
        label: label?.trim() || `Key ${existingCount + 1}`,
        isActive: true,
        failureCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveMockKeys([...keys, created]);
      return created;
    }
    return http.post<ProviderApiKeyStatus>("/api/provider-keys", { provider, apiKey, label });
  },

  async update(id: string, patch: { label?: string; isActive?: boolean }): Promise<ProviderApiKeyStatus> {
    if (USE_MOCK_API) {
      const keys = loadMockKeys();
      const updated = keys.map((k) => (k.id === id ? { ...k, ...patch, updatedAt: new Date().toISOString() } : k));
      saveMockKeys(updated);
      return updated.find((k) => k.id === id)!;
    }
    return http.patch<ProviderApiKeyStatus>(`/api/provider-keys/${id}`, patch);
  },

  async remove(id: string): Promise<void> {
    if (USE_MOCK_API) {
      saveMockKeys(loadMockKeys().filter((k) => k.id !== id));
      return;
    }
    await http.delete(`/api/provider-keys/${id}`);
  },
};