import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LoginPage from '../LoginPage';
import { AuthProvider } from '../../../contexts/AuthContext';
const theme = createTheme();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});
const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <AuthProvider>
            {component}
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};
describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should render login form', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('heading', { name: /mdm admin/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
  it('should show validation errors for empty fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(signInButton);
    await waitFor(() => {
      expect(screen.getByText(/username is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });
  it('should allow user to input credentials', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(usernameInput, 'testuser');
    await user.type(passwordInput, 'password123');
    expect(usernameInput).toHaveValue('testuser');
    expect(passwordInput).toHaveValue('password123');
  });
  it('should toggle password visibility', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    const toggleButton = screen.getByLabelText(/toggle password visibility/i);
    
    // Initially password should be hidden
    expect(passwordInput.type).toBe('password');
    
    // Click to show password
    await user.click(toggleButton);
    expect(passwordInput.type).toBe('text');
    
    // Click to hide password again
    await user.click(toggleButton);
    expect(passwordInput.type).toBe('password');
  });
  it('should submit form with valid credentials', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    await user.type(usernameInput, 'testuser');
    await user.type(passwordInput, 'password123');
    await user.click(signInButton);
    
    // Form should be submitted (we can test this by checking if button becomes disabled)
    await waitFor(() => {
      expect(signInButton).toBeDisabled();
    });
  });
  it('should show loading state during submission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    await user.type(usernameInput, 'testuser');
    await user.type(passwordInput, 'password123');
    await user.click(signInButton);
    await waitFor(() => {
      expect(signInButton).toBeDisabled();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });
});