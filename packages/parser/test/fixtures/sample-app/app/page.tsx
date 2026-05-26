import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { useUser } from "@/hooks/useUser";

export default function HomePage() {
  const { user } = useUser();
  const LazyModal = async () => (await import("@/components/LazyModal")).LazyModal;
  return (
    <main>
      <Header user={user} />
      <h1>Welcome</h1>
      <Footer />
      {LazyModal ? null : null}
    </main>
  );
}
