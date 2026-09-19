import { AccountDeletionPanel } from "@/components/profile/account-deletion-panel";
import { useFirebaseAuth } from "@/lib/firebase-auth";
import { useProfile } from "@/lib/profile-store";

export function AccountDeletionController() {
  const { deleteAccount } = useFirebaseAuth();
  const { clearProfile } = useProfile();

  const deleteCurrentAccount = async (password: string) => {
    await deleteAccount(password);
    await clearProfile();
  };

  return <AccountDeletionPanel onDelete={deleteCurrentAccount} />;
}
