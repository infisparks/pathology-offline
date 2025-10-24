import { db, UserRow } from './localdb';
// In a real Electron app, you'd use a more robust way to manage state
// e.g., a simple global store or a more complex library like Redux/Zustand.
// For this example, we'll use a simple in-memory session and a listener pattern.

export type AuthUser = Omit<UserRow, 'passwordHash'>;

let currentUser: AuthUser | null = null;
let authListeners: ((user: AuthUser | null) => void)[] = [];

// Helper to notify all listeners
const notifyListeners = () => {
  authListeners.forEach(callback => callback(currentUser));
};

// Sign in: Check credentials against local DB
export const signIn = async (email: string, password: string) => {
  const userRecord = await db.user.where({ email: email, passwordHash: password }).first(); // Simplified for demo

  if (userRecord) {
    // Successful login: set current user (excluding password hash)
    const { passwordHash, ...safeUser } = userRecord;
    currentUser = safeUser;
    notifyListeners();
    return { user: currentUser };
  } else {
    // Simulate an error
    throw new Error('Invalid credentials');
  }
};

// Sign up: Insert a new user into the local DB
export const signUp = async (email: string, password: string, name: string) => {
  const newUser: UserRow = {
    created_at: new Date().toISOString(),
    uid: crypto.randomUUID(), // Generate a local UUID
    email,
    passwordHash: password, // Store hash in a real app
    name,
    role: 'user', // Default role for new signups
  };
  const id = await db.user.add(newUser);
  // Optional: auto-login after signup
  // const { passwordHash, ...safeUser } = newUser;
  // currentUser = safeUser;
  // notifyListeners();
  return { user: { ...newUser, id } as AuthUser };
};

// Sign out
export const signOut = async () => {
  currentUser = null;
  notifyListeners();
  return { error: null };
};

// Get current user
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  return currentUser;
};

// Auth state change listener
export const onAuthStateChange = (callback: (user: AuthUser | null) => void) => {
  authListeners.push(callback);
  callback(currentUser); // Call immediately with current state
  // Return an unsubscribe function
  return {
    subscription: {
      unsubscribe: () => {
        authListeners = authListeners.filter(listener => listener !== callback);
      }
    }
  };
};

// You might need to check localStorage/sessionStorage on startup
// to see if a session token was saved, but for simplicity, we start unauthenticated.