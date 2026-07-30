import type { SupabaseClient } from "@supabase/supabase-js";

type LogMessageOptions = {
  blockReason?: string | null;
  blocked: boolean;
  message: string;
  userId: string;
};

export async function logMessage(
  supabase: SupabaseClient,
  { blockReason = null, blocked, message, userId }: LogMessageOptions,
) {
  const normalizedMessage = message.trim().slice(0, 2_000);

  if (!normalizedMessage) {
    return;
  }

  const { error } = await supabase.from("message_logs").insert({
    block_reason: blockReason,
    blocked,
    message: normalizedMessage,
    user_id: userId,
  });

  if (error) {
    console.error("Nie udalo sie zapisac message_logs:", error.message);
  }
}
