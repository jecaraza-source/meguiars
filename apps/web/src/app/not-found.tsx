import { errorCopy } from "@meguiars/domain";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";

/** Ruta inexistente o notFound() de una pantalla. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-(--mg-layout-narrow) flex-col justify-center p-lg">
      <EmptyState
        title={errorCopy.notFoundTitle}
        message={errorCopy.notFoundMessage}
        action={<ButtonLink href="/" label={errorCopy.home} variant="primary" />}
      />
    </main>
  );
}
