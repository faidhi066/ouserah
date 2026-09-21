import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Group, Profile, UserRole } from '../types/database';

export type RoleContext = 'murabbi' | 'mutarabbi' | 'admin';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  groups: Group[];
  murabbiGroups: Group[];
  mutarabbiGroups: Group[];
  activeGroup: Group | null;
  activeRoleContext: RoleContext | null;
  loading: boolean;
  setActiveGroup: (group: Group) => void;
  selectGroupWithRole: (group: Group, roleContext: RoleContext) => void;
  hasRole: (role: UserRole) => boolean;
  refreshProfile: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<Group | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [murabbiGroups, setMurabbiGroups] = useState<Group[]>([]);
  const [mutarabbiGroups, setMutarabbiGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [activeRoleContext, setActiveRoleContext] = useState<RoleContext | null>(null);
  const [loading, setLoading] = useState(true);

  const hasRole = (role: UserRole): boolean => {
    if (!profile || !profile.roles) return false;
    return profile.roles.includes(role);
  };

  const fetchGroups = async (userProfile?: Profile | null) => {
    try {
      if (!userProfile) return;

      const userRoles: UserRole[] = userProfile.roles || [];
      const isAdmin = userRoles.includes('admin');

      let fetchedMurabbiGroups: Group[] = [];
      let fetchedMutarabbiGroups: Group[] = [];

      if (isAdmin) {
        const { data } = await supabase.from('groups').select('*').order('name');
        fetchedMurabbiGroups = data || [];
      }

      // Query group_members table for user's explicit group memberships
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('role, group_id, groups(*)')
        .eq('user_id', userProfile.id);

      if (memberRows) {
        memberRows.forEach((row: any) => {
          if (row.groups) {
            const groupData = row.groups as Group;
            if (row.role === 'murabbi' && !isAdmin) {
              fetchedMurabbiGroups.push(groupData);
            } else if (row.role === 'mutarabbi') {
              fetchedMutarabbiGroups.push(groupData);
            }
          }
        });
      }

      setMurabbiGroups(fetchedMurabbiGroups);
      setMutarabbiGroups(fetchedMutarabbiGroups);

      // Unique combined list of groups
      const allMap = new Map<string, Group>();
      fetchedMurabbiGroups.forEach((g) => allMap.set(g.id, g));
      fetchedMutarabbiGroups.forEach((g) => allMap.set(g.id, g));
      const userGroups = Array.from(allMap.values());
      setGroups(userGroups);

      if (userGroups.length > 0) {
        setActiveGroup((prevGroup) => {
          if (prevGroup && userGroups.some((g) => g.id === prevGroup.id)) {
            return prevGroup;
          }
          const defaultGroup = fetchedMurabbiGroups[0] || fetchedMutarabbiGroups[0] || userGroups[0];
          const isDefaultMurabbi = fetchedMurabbiGroups.some((g) => g.id === defaultGroup.id);
          setActiveRoleContext(isAdmin ? 'admin' : isDefaultMurabbi ? 'murabbi' : 'mutarabbi');
          return defaultGroup;
        });
      }
    } catch (err) {
      console.error('Error in fetchGroups:', err);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error.message);
      } else {
        const userProf = data as Profile;
        if (!userProf.roles) {
          userProf.roles = ['mutarabbi'];
        }
        setProfile(userProf);
        await fetchGroups(userProf);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const selectGroupWithRole = (group: Group, roleContext: RoleContext) => {
    setActiveGroup(group);
    setActiveRoleContext(roleContext);
  };

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
      setLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setGroups([]);
        setMurabbiGroups([]);
        setMutarabbiGroups([]);
        setActiveGroup(null);
        setActiveRoleContext(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const refreshGroups = async () => {
    await fetchGroups(profile);
  };

  const createGroup = async (name: string): Promise<Group | null> => {
    if (!profile) return null;
    try {
      const trimmedName = name.trim();
      if (!trimmedName) return null;

      const { data, error } = await supabase
        .from('groups')
        .insert({
          name: trimmedName,
          murabbi_id: profile.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating group:', error.message);
        throw error;
      }

      const newGroup = data as Group;

      // Add to group_members table
      await supabase.from('group_members').insert({
        user_id: profile.id,
        group_id: newGroup.id,
        role: 'murabbi',
      });

      // Ensure 'murabbi' is in roles
      const currentRoles = profile.roles || [];
      if (!currentRoles.includes('murabbi')) {
        const updatedRoles = [...currentRoles, 'murabbi' as UserRole];
        await supabase
          .from('profiles')
          .update({ roles: updatedRoles })
          .eq('id', profile.id);
        setProfile((prev) => prev ? { ...prev, roles: updatedRoles } : null);
      }

      setMurabbiGroups((prev) => [...prev, newGroup].sort((a, b) => a.name.localeCompare(b.name)));
      setGroups((prev) => [...prev, newGroup].sort((a, b) => a.name.localeCompare(b.name)));

      setActiveGroup(newGroup);
      setActiveRoleContext('murabbi');

      return newGroup;
    } catch (err) {
      console.error('Error in createGroup:', err);
      throw err;
    }
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setGroups([]);
    setMurabbiGroups([]);
    setMutarabbiGroups([]);
    setActiveGroup(null);
    setActiveRoleContext(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        groups,
        murabbiGroups,
        mutarabbiGroups,
        activeGroup,
        activeRoleContext,
        loading,
        setActiveGroup,
        selectGroupWithRole,
        hasRole,
        refreshProfile,
        refreshGroups,
        createGroup,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);