import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { SessionUser } from "@/lib/auth";

type AuthState = {
  isAuthenticated: boolean;
  user: SessionUser | null;
};

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<SessionUser>) {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
    clearSessionState(state) {
      state.user = null;
      state.isAuthenticated = false;
    },
  },
});

export const { setSession, clearSessionState } = authSlice.actions;
export default authSlice.reducer;
