import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

const API = typeof window !== 'undefined' && window.location.hostname
  ? `http://${window.location.hostname}:5001`
  : 'http://localhost:5001';
const SOCKET_URL = API;

// --- Types ---

export type ServiceStatus = 'starting' | 'running' | 'stopped' | 'unavailable';

export interface DetectedService {
  id: string;
  projectPath: string;
  processId?: number;
  command?: string;
  framework?: string;
  name: string;
  host: string;
  port: number;
  url: string;
  proxyUrl?: string;
  protocol: 'http' | 'https';
  hasUI: boolean;
  status: ServiceStatus;
  lastSeen: number;
  previousPorts: number[];
}

export function getServiceProxyUrl(service: DetectedService): string {
  if (service.proxyUrl) {
    return service.proxyUrl.startsWith('http') ? service.proxyUrl : `${API}${service.proxyUrl}`;
  }
  return `${API}/preview/${service.id}`;
}

export type BrowserTabStatus = 'loading' | 'ready' | 'error' | 'reconnecting';

export interface BrowserTab {
  id: string;
  serviceId: string;
  title: string;
  url: string;
  proxyUrl: string;
  currentPath: string;
  active: boolean;
  status: BrowserTabStatus;
  framework?: string;
  error?: string;
  port: number;
}

export interface ServiceEvent {
  type: 'discovered' | 'portChanged' | 'stopped' | 'restarted' | 'ready' | 'removed';
  service: DetectedService;
  oldPort?: number;
  newPort?: number;
}

// --- Hook ---

export function useBrowserServices(socketRef: React.MutableRefObject<Socket | null>) {
  const [services, setServices] = useState<DetectedService[]>([]);
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const tabsRef = useRef<BrowserTab[]>([]);
  tabsRef.current = tabs;

  // --- Fetch initial services ---
  const fetchServices = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/browser/services`);
      if (Array.isArray(res.data)) {
        setServices(res.data);
        // Auto-create tabs for UI services
        for (const service of res.data) {
          if (service.hasUI && (service.status === 'running' || service.status === 'starting')) {
            ensureTabForService(service);
          }
        }
      }
    } catch {
      // Backend might not be ready yet
    }
  }, []);

  // --- Refresh discovery manually ---
  const refreshServices = useCallback(async () => {
    try {
      const res = await axios.post(`${API}/browser/services/refresh`);
      if (Array.isArray(res.data)) {
        setServices(res.data);
      }
    } catch { /* ignore */ }
  }, []);

  // --- Create or update a tab for a service ---
  const ensureTabForService = useCallback((service: DetectedService) => {
    setTabs(prev => {
      const existing = prev.find(t => t.serviceId === service.id);
      const tabProxyUrl = getServiceProxyUrl(service);

      if (existing) {
        // Update the existing tab
        return prev.map(t => {
          if (t.serviceId === service.id) {
            // Preserve the current path when port changes
            const newUrl = service.url;

            return {
              ...t,
              title: service.name,
              url: newUrl + t.currentPath,
              proxyUrl: tabProxyUrl + t.currentPath,
              port: service.port,
              framework: service.framework,
              status: service.status === 'running' ? 'ready' as const : 'loading' as const,
              error: undefined,
            };
          }
          return t;
        });
      }

      // Create new tab
      const newTab: BrowserTab = {
        id: `tab-${service.id}`,
        serviceId: service.id,
        title: service.name,
        url: service.url,
        proxyUrl: tabProxyUrl,
        currentPath: '',
        active: false,
        status: service.status === 'running' ? 'ready' : 'loading',
        framework: service.framework,
        port: service.port,
      };

      const updated = [...prev, newTab];

      // If this is the first tab, auto-activate it
      if (prev.length === 0) {
        newTab.active = true;
        setActiveTabId(newTab.id);
      }

      return updated;
    });
  }, []);

  // --- Handle service events from Socket.IO ---
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;

    const handleServiceEvent = (event: ServiceEvent) => {
      const { type, service, oldPort, newPort } = event;

      switch (type) {
        case 'discovered':
        case 'ready':
          setServices(prev => {
            const exists = prev.find(s => s.id === service.id);
            if (exists) {
              return prev.map(s => s.id === service.id ? service : s);
            }
            return [...prev, service];
          });
          if (service.hasUI) {
            ensureTabForService(service);
          }
          break;

        case 'portChanged':
          setServices(prev => prev.map(s => s.id === service.id ? service : s));
          // Update the tab URL, preserving the SPA route
          setTabs(prev => prev.map(t => {
            if (t.serviceId === service.id) {
              const tabProxyUrl = getServiceProxyUrl(service);
              return {
                ...t,
                title: service.name,
                url: service.url + t.currentPath,
                proxyUrl: tabProxyUrl + t.currentPath,
                port: service.port,
                status: 'loading',
                error: undefined,
              };
            }
            return t;
          }));
          break;

        case 'stopped':
          setServices(prev => prev.map(s => s.id === service.id ? service : s));
          setTabs(prev => prev.map(t => {
            if (t.serviceId === service.id) {
              return {
                ...t,
                status: 'reconnecting',
                error: 'Server stopped. Searching for replacement...',
              };
            }
            return t;
          }));
          break;

        case 'restarted':
          setServices(prev => prev.map(s => s.id === service.id ? service : s));
          setTabs(prev => prev.map(t => {
            if (t.serviceId === service.id) {
              const tabProxyUrl = getServiceProxyUrl(service);
              return {
                ...t,
                url: service.url + t.currentPath,
                proxyUrl: tabProxyUrl + t.currentPath,
                port: service.port,
                status: 'loading',
                error: undefined,
              };
            }
            return t;
          }));
          break;

        case 'removed':
          setServices(prev => prev.filter(s => s.id !== service.id));
          // Don't remove the tab immediately — show error state
          setTabs(prev => prev.map(t => {
            if (t.serviceId === service.id) {
              return { ...t, status: 'error', error: 'Service removed' };
            }
            return t;
          }));
          break;
      }
    };

    const handleServicesList = (servicesList: DetectedService[]) => {
      setServices(servicesList);
    };

    sock.on('browser_service', handleServiceEvent);
    sock.on('browser_services_list', handleServicesList);

    // Fetch initial state
    fetchServices();

    return () => {
      sock.off('browser_service', handleServiceEvent);
      sock.off('browser_services_list', handleServicesList);
    };
  }, [socketRef.current, ensureTabForService, fetchServices]);

  // --- Tab management ---

  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setTabs(prev => prev.map(t => ({
      ...t,
      active: t.id === tabId,
    })));
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const updated = prev.filter(t => t.id !== tabId);
      // If we closed the active tab, activate the last one
      if (tabId === activeTabId && updated.length > 0) {
        const newActive = updated[updated.length - 1];
        newActive.active = true;
        setActiveTabId(newActive.id);
      } else if (updated.length === 0) {
        setActiveTabId(null);
      }
      return updated;
    });
  }, [activeTabId]);

  const addManualTab = useCallback(async (url: string, title?: string) => {
    const id = `manual-${Date.now()}`;
    let proxyUrl = url;
    let serviceId = '';
    let framework: string | undefined;
    let port = 0;

    try {
      const res = await axios.post(`${API}/browser/services/manual`, { url, name: title });
      if (res.data && res.data.id) {
        const registered = res.data as DetectedService;
        serviceId = registered.id;
        proxyUrl = getServiceProxyUrl(registered);
        framework = registered.framework;
        port = registered.port;
      }
    } catch {
      // Fallback: if registration fails, proxyUrl remains direct url
    }

    const newTab: BrowserTab = {
      id,
      serviceId,
      title: title || url,
      url,
      proxyUrl,
      currentPath: '',
      active: true,
      status: 'loading',
      framework,
      port,
    };

    setTabs(prev => {
      const deactivated = prev.map(t => ({ ...t, active: false }));
      return [...deactivated, newTab];
    });
    setActiveTabId(id);
  }, []);

  const updateTabPath = useCallback((tabId: string, newPath: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id === tabId) {
        return { ...t, currentPath: newPath };
      }
      return t;
    }));
  }, []);

  const updateTabStatus = useCallback((tabId: string, status: BrowserTabStatus, error?: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id === tabId) {
        return { ...t, status, error };
      }
      return t;
    }));
  }, []);

  const navigateTab = useCallback((tabId: string, newUrl: string) => {
    setActiveTabId(tabId);
    setTabs(prev => prev.map(t => {
      if (t.id === tabId) {
        let proxyUrl = t.proxyUrl;
        if (t.serviceId && t.proxyUrl && t.proxyUrl.includes(t.serviceId)) {
          const baseProxy = t.proxyUrl.split(t.serviceId)[0] + t.serviceId;
          try {
            const parsed = new URL(newUrl);
            proxyUrl = `${baseProxy}${parsed.pathname}${parsed.search}${parsed.hash}`;
          } catch {
            proxyUrl = `${baseProxy}/${newUrl.replace(/^\/+/, '')}`;
          }
        } else {
          proxyUrl = newUrl;
        }
        return {
          ...t,
          url: newUrl,
          proxyUrl,
          active: true,
          status: 'loading' as const,
        };
      }
      return { ...t, active: false };
    }));
  }, []);

  const activeTab = tabs.find(t => t.id === activeTabId) || null;

  return {
    services,
    tabs,
    activeTab,
    activeTabId,
    selectTab,
    closeTab,
    addManualTab,
    navigateTab,
    updateTabPath,
    updateTabStatus,
    refreshServices,
  };
}
