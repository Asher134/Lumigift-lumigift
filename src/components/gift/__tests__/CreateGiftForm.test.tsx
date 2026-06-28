import { fireEvent, render, screen, act } from "@testing-library/react";
import { CreateGiftForm } from "../CreateGiftForm";

// Mock out dependencies
jest.mock("@/hooks/useCsrf", () => ({
  useCsrf: () => ({
    csrfFetch: jest.fn(),
  }),
}));

jest.mock("@/components/ui/DateTimePicker", () => ({
  DateTimePicker: () => <div data-testid="datetime-picker" />,
}));

jest.mock("../VoiceNoteRecorder", () => ({
  VoiceNoteRecorder: () => <div data-testid="voice-note-recorder" />,
}));

describe("CreateGiftForm debounce", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              ngnPerUsdc: 1500,
              timestamp: Date.now(),
            },
          }),
      })
    );
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("debounces exchange-rate fetch by 400ms when amount changes", async () => {
    render(<CreateGiftForm />);

    // Initial mount triggers 1 fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const input = screen.getByLabelText(/gift amount/i);

    // Type in the input
    fireEvent.change(input, { target: { value: "5000" } });

    // After change, no immediate new fetch should be triggered (still 1 from mount)
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance by 399ms
    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance by 1ms (reaching 400ms)
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels active requests via AbortController on multiple fast changes", async () => {
    render(<CreateGiftForm />);
    
    // Clear mount fetch mock history to simplify
    fetchMock.mockClear();

    const input = screen.getByLabelText(/gift amount/i);

    // Type "5"
    fireEvent.change(input, { target: { value: "5" } });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Type "50"
    fireEvent.change(input, { target: { value: "50" } });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Type "500"
    fireEvent.change(input, { target: { value: "500" } });
    
    // No fetch should have been made since the clear
    expect(fetchMock).toHaveBeenCalledTimes(0);

    // Advance 400ms for the final change
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    // Should only have triggered 1 fetch (the last one)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    
    // Check abort signal parameter passed to fetch
    const lastCall = fetchMock.mock.calls[0];
    expect(lastCall[0]).toBe("/api/v1/exchange-rate");
    expect(lastCall[1].signal).toBeInstanceOf(AbortSignal);
  });
});
