import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoadingSpinner from '../LoadingSpinner';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('LoadingSpinner', () => {
  it('should render with default message', () => {
    renderWithTheme(<LoadingSpinner />);
    
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    const customMessage = 'Loading data...';
    renderWithTheme(<LoadingSpinner message={customMessage} />);
    
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  it('should render in fullscreen mode', () => {
    renderWithTheme(<LoadingSpinner fullScreen />);
    
    const container = screen.getByRole('progressbar').closest('div');
    expect(container).toHaveStyle({
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh'
    });
  });

  it('should render with custom size', () => {
    renderWithTheme(<LoadingSpinner size={60} />);
    
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('style', expect.stringContaining('width: 60px'));
    expect(progressbar).toHaveAttribute('style', expect.stringContaining('height: 60px'));
  });
});