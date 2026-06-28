import { render, screen } from "@testing-library/react";
import Template from "../template";

describe("Template Component", () => {
  it("renders children correctly", () => {
    render(
      <Template>
        <div data-testid="child">Hello World</div>
      </Template>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("applies the page-transition class", () => {
    const { container } = render(
      <Template>
        <div>Content</div>
      </Template>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("page-transition");
  });
});
