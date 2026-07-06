const BASE_URL = 'http://localhost:3000';

const promiseCache = new Map();

export const clearApiCache = () => {
  promiseCache.clear();
};

const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');

  const isFormData = options.isFormData === true;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const method = options.method || 'GET';
  const isGet = method.toUpperCase() === 'GET';
  const cacheKey = `${method}:${endpoint}`;

  if (isGet && promiseCache.has(cacheKey)) {
    return promiseCache.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }

      return data;
    } catch (err) {
      if (isGet) promiseCache.delete(cacheKey);
      throw err;
    }
  })();

  if (isGet) {
    promiseCache.set(cacheKey, promise);
  } else {
    promiseCache.clear();
  }

  return promise;
};

export const api = {
  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  // Users
  getUsers: () => request('/users'),
  getUserById: (id) => request(`/users/${id}`),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadAvatar: (id, formData) => request(`/users/${id}/avatar`, { method: 'POST', body: formData, isFormData: true }),
  updateUserRole: (id, data) => request(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  // Departments
  getDepartments: () => request('/departments'),
  getDepartmentById: (id) => request(`/departments/${id}`),
  createDepartment: (data) => request('/departments', { method: 'POST', body: JSON.stringify(data) }),
  updateDepartment: (id, data) => request(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDepartment: (id) => request(`/departments/${id}`, { method: 'DELETE' }),

  // Shifts
  getShifts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/shifts${query ? `?${query}` : ''}`);
  },
  getShiftById: (id) => request(`/shifts/${id}`),
  getMyShifts: (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/shifts/my${query ? `?${query}` : ''}`);
},
  createShift: (data) => request('/shifts', { method: 'POST', body: JSON.stringify(data) }),
  updateShift: (id, data) => request(`/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteShift: (id) => request(`/shifts/${id}`, { method: 'DELETE' }),
  publishShift: (id) => request(`/shifts/${id}/publish`, { method: 'POST' }),
  unpublishShift: (id) => request(`/shifts/${id}/unpublish`, { method: 'POST' }),
  bulkClearShifts: (data) => request('/shifts/bulk/clear', { method: 'POST', body: JSON.stringify(data) }),
  bulkPublishShifts: (data) => request('/shifts/bulk/publish', { method: 'POST', body: JSON.stringify(data) }),
  autoAssignShifts: (data) => request('/shifts/auto-assign', { method: 'POST', body: JSON.stringify(data) }),
  assignEmployee: (id, data) => request(`/shifts/${id}/assign`, { method: 'POST', body: JSON.stringify(data) }),
  unassignEmployee: (shiftId, userId) => request(`/shifts/${shiftId}/assign/${userId}`, { method: 'DELETE' }),

  // Availability
  getAvailability: (params = {}) => {
    const query = new URLSearchParams({ ...params, _t: Date.now() }).toString();
    return request(`/availability?${query}`);
  },
  getTeamAvailability: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/availability/team${query ? `?${query}` : ''}`);
  },
  submitAvailability: (data) => request('/availability', { method: 'POST', body: JSON.stringify(data) }),
  deleteAvailability: (week_start) => request(`/availability?week_start=${week_start}`, { method: 'DELETE' }),

  // Swaps
  getSwaps: () => request('/swaps'),
  createSwap: (data) => request('/swaps', { method: 'POST', body: JSON.stringify(data) }),
  respondToSwap: (id, data) => request(`/swaps/${id}/respond`, { method: 'PATCH', body: JSON.stringify(data) }),
  approveSwap: (id, data) => request(`/swaps/${id}/approve`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Leave
  getLeave: () => request('/leave'),

  // Blueprints
  getBlueprint: () => request('/blueprints'),
  createBlueprint: (data) => request('/blueprints', { method: 'POST', body: JSON.stringify(data) }),
  updateBlueprint: (id, data) => request(`/blueprints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addBlueprintShift: (id, data) => request(`/blueprints/${id}/shifts`, { method: 'POST', body: JSON.stringify(data) }),
  removeBlueprintShift: (id, slotId) => request(`/blueprints/${id}/shifts/${slotId}`, { method: 'DELETE' }),
  addBlueprintOverride: (id, data) => request(`/blueprints/${id}/overrides`, { method: 'POST', body: JSON.stringify(data) }),
  removeBlueprintOverride: (id, ovId) => request(`/blueprints/${id}/overrides/${ovId}`, { method: 'DELETE' }),
  addBlueprintOverrideShift: (id, ovId, data) => request(`/blueprints/${id}/overrides/${ovId}/shifts`, { method: 'POST', body: JSON.stringify(data) }),
  removeBlueprintOverrideShift: (id, ovId, shiftId) => request(`/blueprints/${id}/overrides/${ovId}/shifts/${shiftId}`, { method: 'DELETE' }),
  addBlueprintPreset: (id, data) => request(`/blueprints/${id}/presets`, { method: 'POST', body: JSON.stringify(data) }),
  removeBlueprintPreset: (id, presetId) => request(`/blueprints/${id}/presets/${presetId}`, { method: 'DELETE' }),
  generateBlueprint: (id, data) => request(`/blueprints/${id}/generate`, { method: 'POST', body: JSON.stringify(data) }),

  // Reports
  getShiftCoverage: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/shifts?${query}`);
  },
  getEmployeeStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/employees?${query}`);
  },
  getReportsLeave: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/reports/leave?${query}`);
  },
  createLeave: (formData) => request('/leave', { method: 'POST', body: formData, isFormData: true }),
  reviewLeave: (id, data) => request(`/leave/${id}/review`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLeave: (id) => request(`/leave/${id}`, { method: 'DELETE' }),
};