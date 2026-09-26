import { activeCenterAccess, catalogCopy } from "@meguiars/domain";
import { createCatalogRepository } from "@meguiars/supabase";
import { createServiceSchema, fieldErrors } from "@meguiars/validation";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import type { FieldErrors, FormValues } from "@/components/ClientFields";
import { ServiceFields } from "@/components/ServiceFields";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Card } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import type { PrivateScreenProps } from "./types";

export function CatalogNewScreen({
  state,
  header,
  onOpen,
  onCancel,
}: PrivateScreenProps & { onOpen: (id: string) => void; onCancel: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (!client) return;
    const parsed = createServiceSchema.safeParse({ ...values, organizationId: center.organizationId });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createCatalogRepository(client).create(parsed.data);
    setBusy(false);
    if (!result.ok) {
      return setError(
        result.error.code === "23505"
          ? catalogCopy.codeTaken
          : result.error.kind === "permission_denied"
            ? catalogCopy.forbidden
            : result.error.message,
      );
    }
    toast({ message: catalogCopy.created, tone: "success" });
    onOpen(result.data.id);
  };

  return (
    <Screen title={catalogCopy.newTitle} description={catalogCopy.newDescription} header={header}>
      <LinkButton label={`← ${catalogCopy.title}`} onPress={onCancel} />
      <Card>
        <Field
          label={catalogCopy.codeLabel}
          hint={catalogCopy.codeHint}
          required
          autoCapitalize="characters"
          autoCorrect={false}
          value={values.code ?? ""}
          onChangeText={(v) => set("code", v)}
          error={errors.code}
        />
        <ServiceFields values={values} errors={errors} set={set} />
        <Notice tone="danger" text={error} />
        <Button label={catalogCopy.submitCreate} loading={busy} onPress={() => void submit()} />
      </Card>
    </Screen>
  );
}
