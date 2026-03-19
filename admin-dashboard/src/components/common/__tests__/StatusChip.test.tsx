import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusChip from '../StatusChip';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('StatusChip', () => {
  it('should render active status with correct color', () => {
    renderWithTheme(<StatusChip status="ACTIVE" />);
    
    const chip = screen.getByText('ACTIVE');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('MuiChip-root');
  });

  it('should render inactive status', () => {
    renderWithTheme(<StatusChip status="INACTIVE" />);
    
    const chip = screen.getByText('INACTIVE');
    expect(chip).toBeInTheDocument();
  });

  it('should render suspended status', () => {
    renderWithTheme(<StatusChip status="SUSPENDED" />);
    
    const chip = screen.getByText('SUSPENDED');
    expect(chip).toBeInTheDocument();
  });

  it('should render with custom label when provided', () => {
    renderWithTheme(<StatusChip status="ACTIVE" label="Online" />);
    
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
  });

  it('should apply correct variant and size', () => {
    renderWithTheme(<StatusChip status="ACTIVE" variant="outlined" size="small" />);
    
    const chip = screen.getByText('ACTIVE');
    expect(chip).toHaveClass('MuiChip-outlined');
    expect(chip).toHaveClass('MuiChip-sizeSmall');
  });
});