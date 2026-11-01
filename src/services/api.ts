/* src/services/api.ts */
import axios from 'axios';
import type {
  ApiResponse,
  CreateRestaurantInput,
  CreateSubmissionInput,
  EntityId,
  Restaurant,
  Submission,
  SubmissionStatus,
  UpdateRestaurantInput,
  UpdateSubmissionInput,
} from '../types';
import { readStoredValue } from './storage';
import { isRestaurant, isSubmission } from './validation';

// 맛집 데이터는 pwd-week6 Express 서버(Render)에서 받아옵니다.
// 서버 주소는 VITE_API_URL 환경변수로 지정합니다 (.env.development / .env.production).
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const http = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 60000, // Render 무료 인스턴스는 잠에서 깨는 데 30초 이상 걸릴 수 있습니다.
});

const SUBMISSIONS_KEY = 'pwd-week5-submissions';

function readItems<T>(key: string, isItem: (value: unknown) => value is T, fallback: T[] = []): T[] {
  return readStoredValue(key, (value): value is T[] =>
    Array.isArray(value) && value.every(isItem), fallback);
}

function writeItems<T>(key: string, items: T[]): void {
  // 저장 실패는 호출자에게 전달하여 성공 메시지가 표시되지 않도록 합니다.
  localStorage.setItem(key, JSON.stringify(items));
}

function updateItem<T extends { id: EntityId }>(
  key: string,
  id: EntityId,
  payload: Partial<Omit<T, 'id'>>,
  isItem: (value: unknown) => value is T,
  fallback: T[] = [],
): ApiResponse<T> {
  const items = readItems(key, isItem, fallback);
  const index = items.findIndex((item) => String(item.id) === String(id));
  const original = items[index];
  if (!original) throw new Error('항목을 찾을 수 없습니다.');
  const updated = { ...original, ...payload, id: original.id };
  if (!isItem(updated)) throw new Error('수정할 데이터 형식을 확인해주세요.');
  items[index] = updated;
  writeItems(key, items);
  return { data: updated };
}

function deleteItem<T extends { id: EntityId }>(
  key: string,
  id: EntityId,
  isItem: (value: unknown) => value is T,
  fallback: T[] = [],
): number {
  const items = readItems(key, isItem, fallback);
  writeItems(key, items.filter((item) => String(item.id) !== String(id)));
  return 204;
}

// 기존 페이지가 사용하는 비동기 인터페이스와 { data: ... } 응답을 유지합니다.
// 서버 응답 형식 { success, count?, data }에서 data를 그대로 사용합니다.
export const restaurantAPI = {
  getRestaurants: async (): Promise<ApiResponse<Restaurant[]>> => {
    const res = await http.get<ApiResponse<unknown>>('/restaurants');
    return { data: toRestaurants(res.data.data) };
  },

  getRestaurantById: async (id: EntityId): Promise<ApiResponse<Restaurant | undefined>> => {
    try {
      const res = await http.get<ApiResponse<unknown>>(`/restaurants/${id}`);
      return { data: isRestaurant(res.data.data) ? res.data.data : undefined };
    } catch (error) {
      // 없는 맛집(404)이나 잘못된 id(400)는 기존처럼 undefined로 처리합니다.
      if (axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 400)) {
        return { data: undefined };
      }
      throw error;
    }
  },

  getPopularRestaurants: async (): Promise<ApiResponse<Restaurant[]>> => {
    const res = await http.get<ApiResponse<unknown>>('/restaurants/popular', { params: { limit: 5 } });
    return { data: toRestaurants(res.data.data) };
  },

  createRestaurant: async (payload: CreateRestaurantInput): Promise<ApiResponse<Restaurant>> => {
    const res = await http.post<ApiResponse<Restaurant>>('/restaurants', payload);
    return { data: res.data.data };
  },

  updateRestaurant: async (id: EntityId, payload: UpdateRestaurantInput): Promise<ApiResponse<Restaurant>> => {
    const res = await http.put<ApiResponse<Restaurant>>(`/restaurants/${id}`, payload);
    return { data: res.data.data };
  },

  deleteRestaurant: async (id: EntityId): Promise<number> => {
    const res = await http.delete(`/restaurants/${id}`);
    return res.status;
  },
};

function toRestaurants(value: unknown): Restaurant[] {
  if (!Array.isArray(value) || !value.every(isRestaurant)) {
    throw new Error('서버에서 받은 맛집 데이터 형식을 확인해주세요.');
  }
  return value;
}

// 제보(submission) API는 서버에 엔드포인트가 없어 브라우저 저장소를 그대로 사용합니다.
export const submissionAPI = {
  createSubmission: async (payload: CreateSubmissionInput): Promise<ApiResponse<Submission>> => {
    const items = readItems(SUBMISSIONS_KEY, isSubmission);
    const item: Submission = { ...payload, id: crypto.randomUUID(), status: 'pending' };
    writeItems(SUBMISSIONS_KEY, [...items, item]);
    return { data: item };
  },

  listSubmissions: async (status?: SubmissionStatus): Promise<ApiResponse<Submission[]>> => ({
    data: readItems(SUBMISSIONS_KEY, isSubmission).filter((item) => !status || item.status === status),
  }),

  updateSubmission: async (id: EntityId, payload: UpdateSubmissionInput): Promise<ApiResponse<Submission>> =>
    updateItem(SUBMISSIONS_KEY, id, payload, isSubmission),

  deleteSubmission: async (id: EntityId): Promise<number> =>
    deleteItem(SUBMISSIONS_KEY, id, isSubmission),
};

export default restaurantAPI;
