import { Notice } from "./Notice";

export function ErrorBanner(props: {
  readonly message: string;
  readonly localizeMessage?: boolean;
}) {
  return <Notice tone="danger" message={props.message} localizeMessage={props.localizeMessage} />;
}
