import { useState, useCallback } from 'react';
import axios from 'axios';

const API = 'http://localhost:5001';

interface WorkspaceState {
  path: string | null;
  name: string | null;
  type: 'existing' | 'new' | null;
  initialized: boolean;
}

const EMPTY_WORKSPACE: WorkspaceState = {
  path: null,
  name: null,
  type: null,
  initialized: false,
};

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/workspace`);
      setWorkspace(res.data);
    } catch (err: any) {
      console.error('[useWorkspace] Failed to fetch workspace:', err);
    }
  }, []);

  const selectWorkspace = useCallback(async (dirPath: string): Promise<WorkspaceState> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/workspace/select`, { path: dirPath });
      setWorkspace(res.data);
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const createWorkspace = useCallback(async (parentDir: string, projectName: string): Promise<WorkspaceState> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/workspace/create`, { parentDir, projectName });
      setWorkspace(res.data);
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearWorkspace = useCallback(async () => {
    try {
      const res = await axios.post(`${API}/workspace/clear`);
      setWorkspace(res.data);
    } catch (err: any) {
      console.error('[useWorkspace] Failed to clear workspace:', err);
    }
  }, []);

  return {
    workspace,
    loading,
    error,
    fetchWorkspace,
    selectWorkspace,
    createWorkspace,
    clearWorkspace,
    isActive: workspace.path !== null && workspace.initialized,
  };
}
