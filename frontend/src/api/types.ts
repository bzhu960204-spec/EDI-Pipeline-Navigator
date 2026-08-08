export interface UserDto {
  id: number;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'USER';
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}
