export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import TeacherModulesClient from "./TeacherModulesClient";

export default async function TeacherModulesPage() {
    const supabase = await createServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const admin = createAdminClient();
    const { data: pd } = await admin
        .from("profiles")
        .select("*")
        .eq("id", (user as any).id)
        .single();
    const profile = pd as any;
    if (profile?.role !== "teacher") redirect("/student/modules");

    const { data: mods } = await admin
        .from("modules")
        .select(
            "id,title,description,tag,access_code,unlock_mode,created_at,archived",
        )
        .eq("teacher_id", (user as any).id)
        .order("created_at", { ascending: false });
    const modules = (mods ?? []) as any[];

    // Counts per module
    const counts: Record<string, { lessons: number; enrollments: number }> = {};
    await Promise.all(
        modules.map(async (m: any) => {
            const [l, e] = await Promise.all([
                admin
                    .from("lessons")
                    .select("*", { count: "exact", head: true })
                    .eq("module_id", m.id),
                admin
                    .from("enrollments")
                    .select("*", { count: "exact", head: true })
                    .eq("module_id", m.id),
            ]);
            counts[m.id] = { lessons: l.count ?? 0, enrollments: e.count ?? 0 };
        }),
    );

    return (
        <AppShell user={profile} role="teacher" wide>
            <TeacherModulesClient
                profile={profile}
                modules={modules}
                counts={counts}
            />
        </AppShell>
    );
}
